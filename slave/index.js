'use strict';
const os        = require('os');

const md5       = require('nyks/crypto/md5');
const ubkClient = require('ubk/client/tcp');
const SSH_Host  = require('./ssh_host.js');
const utils     = require('ssh2').utils;
const debug     = require('debug')('mas4h:slave');
const NS_mas4h = "mas4h";

class Instance extends ubkClient {
  constructor(options) {

    options = Object.assign({
      key : null, //put server private key here
      ssh_port   : 1443,
      ssh_addr   : '0.0.0.0',
      use_socketwrap : false,
    }, options);

    super(options);
    this._localClients = {};
    const localIpv4Ips = Object.values(os.networkInterfaces()).reduce((v, c) => [...v, ...c], []).filter(v => v.family === "IPv4" && !v.internal);
    this.options.registration_parameters['ips'] = localIpv4Ips.map(v => v.address);

    var key  = utils.parseKey(this.options.key);
    this.client_key = md5(key.getPublicSSH());
  }

  async run() {

    var server = new SSH_Host({
      server_rsa     : this.options.key,
      use_socketwrap : this.options.use_socketwrap
    }, async (client, infos) => {
      client.on('error', (err) => debug('client error', err));

      try {
        var details;
        await server.check_authentication(client, async (pubkey) => {
          details = await this.validate_client(pubkey);
          if(!details.client_key)
            throw 'no client_key';

          debug("New client, validated device key is '%s'.", details.client_key);
          details  = Object.assign({client_key : details.client_key}, {remote_details : details}) || {};
        });
        const forwardInfo = await server.prepare_forward_server(client);
        details = {...details, ...forwardInfo, remoteAddress : infos.ip};

        await this.new_client(client, details);
        client.on('error', () => {
          debug("error client will close '%s'.", details.client_key);
          client.end();
        });
        client.on('end', this.lost_client.bind(this, client, details));
      } catch(err) {
        debug("New link failure", err);
        client.end();
      }
    });

    var port = await server.listen(this.options.ssh_port, this.options.ssh_addr);

    this.on("registered", () => {
      debug("Sending registerration ack");
      this.send(NS_mas4h, "instance_ready", this.client_key, port, Object.values(this._localClients).map(c => c.details));
    });

    this.register_rpc(NS_mas4h, "kick", (client_key) => {
      var {client} = this._localClients[client_key];
      client.end();
    });


    super.connect();
  }


  async validate_client(pubkey) {
    //forward this to central server
    var response = await this.send(NS_mas4h, "validate_client", pubkey);
    return response;
  }

  async lost_client(client, details) {
    debug("Client %s disconnected, local binding was %s", details.client_key, details.port);

    //try to notify central server (maybe unavailable)
    try {
      await this.send(NS_mas4h, "lost_tunnel", details.client_key);
    } catch(err) {
      debug("cant send lost tunnel to server for %s", details.client_key);
    }

    delete this._localClients[details.client_key];
  }

  async new_client(client, details) {

    if(this._localClients[details.client_key]) {
      debug("%s already in the clients list", details.client_key);
      return client.end();
    }
    //register in localClient before remote ack (prevent free_port confusion)
    this._localClients[details.client_key] = {details, client};

    //notify central server, then attach client key
    try {
      await this.send(NS_mas4h, "new_tunnel", this.client_key, details);
      debug("Client %s connected and validated", details.client_key);
    } catch(err) {
      delete this._localClients[details.client_key];
      throw err;
    }
  }
}


module.exports = Instance;
