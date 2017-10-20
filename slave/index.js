'use strict';

const md5       = require('nyks/crypto/md5');
const contains  = require('mout/array/contains');
const forIn     = require('mout/object/forIn');
const ubkClient = require('ubk/client/tcp');
const SSH_Host  = require('./ssh_host.js');
const utils     = require('ssh2').utils;
const debug       = require('debug')('mas4h:slave');

const NS_mas4h = "mas4h";

class Instance extends ubkClient{
  constructor(options){
    options = Object.assign({
      key : null, //put server private key here
      ssh_port   : 1443,
      ssh_addr   : '0.0.0.0',
    }, options)
    
    super(options);
    this._localClients = {};
  
    var key  = utils.parseKey(this.options.key);
    this.client_key = md5(utils.genPublicKey(key).public);
    
    this.new_device      = this.new_device.bind(this);
    this.validate_device = this.validate_device.bind(this);
    this.new_client      = this.new_client.bind(this);
    this.lost_device     = this.lost_device.bind(this);
    
    var server = new SSH_Host(this.options.key,
      this.new_device,
      this.validate_device,
      this.new_client,
      this.lost_device
    );
    var self = this;
    this.once('registered', () => {
      debug("Registered");
      server.listen(this.options.ssh_port, this.options.ssh_addr, function() {
        server.port = this.address().port;
        self.emit("registered");
      });
    });

    //trigger every time the server is reachable
    this.on("registered", () => {
      if(!server.port)  //first round
        return;
      debug("Sending registerration ack" );
      this.send(NS_mas4h, "instance_ready", this.client_key, server.port , Object.values(this._localClients));
    });
  }

  connect(){
    super.connect();
  }

  new_device(client){
      //ras
  }

  async validate_device(pubkey) {
    //forward this to central server
    var response = await this.send(NS_mas4h, "validate_device", pubkey);
    return response;
  }

  async lost_device(client){
    //notify central server, the remove client reference
    var response = await this.send(NS_mas4h, "lost_tunnel", client.details.client_key);
    delete this._localClients[client.details.client_key];
    return response;
  }

  async new_client(client, port) {

    client.details.port = port;
    //register in localClient before remote ack (prevent free_port confusion) 
    this._localClients[client.details.client_key] = client.details;

    //notify central server, then attach device key
    try{
      await this.send(NS_mas4h, "new_tunnel", client.details, this.client_key);
    }catch(err){
      delete this._localClients[client.details.client_key];
      throw err;
    }
  }
}


module.exports = Instance;
