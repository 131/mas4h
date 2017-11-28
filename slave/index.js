'use strict';

const md5       = require('nyks/crypto/md5');
const ubkClient = require('ubk/client/tcp');
const SSH_Host  = require('./ssh_host.js');
const utils     = require('ssh2').utils;
const debug       = require('debug')('mas4h:slave');

const NS_mas4h = "mas4h";

class Instance extends ubkClient {
  constructor(options) {

    options = Object.assign({
      key : null, //put server private key here
      ssh_port   : 1443,
      ssh_addr   : '0.0.0.0',
    }, options);

    super(options);
    this._localClients = {};

    var key  = utils.parseKey(this.options.key);
    this.client_key = md5(utils.genPublicKey(key).public);
  }

  async run() {

    var server = new SSH_Host(this.options.key, async(client) => {
      client.on('error', (err) => debug('client error', err));

      try {
        var details;
        await server.check_authentication(client, async(pubkey) => {
          details = await this.validate_client(pubkey);
          if(!details.client_key)
            throw 'no client_key';

          debug("New client, validated device key is '%s'.", details.client_key);
          details  = Object.assign({client_key : details.client_key}, {remote_details : details}) || {};
        });

        details.port = await server.prepare_forward_server(client);

        await this.new_client(client, details);
        client.on('end', this.lost_client.bind(this, client, details));
      } catch(err) {
        debug("New link failure", err);
        client.end();
      }
    });

    var port = await server.listen(this.options.ssh_port, this.options.ssh_addr);

    this.on("registered", () => {
      debug("Sending registerration ack");
      this.send(NS_mas4h, "instance_ready", this.client_key, port, Object.values(this._localClients));
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

    //notify central server, the remove client reference
    var response = await this.send(NS_mas4h, "lost_tunnel", details.client_key);
    delete this._localClients[details.client_key];
    return response;
  }

  async new_client(client, details) {

    //register in localClient before remote ack (prevent free_port confusion)
    this._localClients[details.client_key] = details;

    //notify central server, then attach client key
    try {
      await this.send(NS_mas4h, "new_tunnel", this.client_key, details);
    } catch(err) {
      delete this._localClients[details.client_key];
      throw err;
    }
  }
}


module.exports = Instance;
