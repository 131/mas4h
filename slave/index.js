'use strict';

const md5       = require('nyks/crypto/md5');
const contains  = require('mout/array/contains');
const forIn     = require('mout/object/forIn');
const ubkClient = require('ubk/client/tcp');
const SSH_Host  = require('./ssh_host.js');
const utils     = require('ssh2').utils;

const NS_mas4h = "mas4h";

class Instance extends ubkClient{
  constructor(options){
    options = Object.assign({
      key : null, //put server private key here
      port_range : [10000, 20000],
      ssh_port   : 1443,
      ssh_addr   : '0.0.0.0',
    }, options)
    
    super(options);
    this._localClients = {};
  
    var key  = utils.parseKey(this.options.key);
    this.client_key = md5(utils.genPublicKey(key).public);
    
    this.new_device      = this.new_device.bind(this);
    this.validate_device = this.validate_device.bind(this);
    this.fetch_port      = this.fetch_port.bind(this);
    this.lost_device     = this.lost_device.bind(this);
    
    var server = new SSH_Host(this.options.key,
      this.new_device,
      this.validate_device,
      this.fetch_port,
      this.lost_device
    );
    var self = this;
    this.once('registered', () => {
      console.log("Registered");
      server.listen(this.options.ssh_port, this.options.ssh_addr, function() {
        server.port = this.address().port;
        self.emit("registered");
      });
    });

    //trigger every time the server is reachable
    this.on("registered", () => {
      if(!server.port)  //first round
        return;
      console.log("Sending registerration ack");
      this.send(NS_mas4h, "instance_ready", [server.port]);
    });

  }

  connect(chain){
    super.connect(chain, () => {
      this.stop();
      console.log("Will reconnect shortly");
      setTimeout(() => {
        this.connect(chain);
      }, 3000);
    });
  }

    //we lost main server lnk, cleaning everything up
  stop() {
    forIn(this._localClients, (client, client_key) => {
      client.end();
      delete this._localClients[client.device_key];
    });
  }

  new_device(client){
      //ras
  }

  validate_device(pubkey, chain) {
    //forward this to central server
    this.call_rpc(NS_mas4h, "validate_device", [pubkey], chain);
  }

  lost_device(client){
    //notify central server, the remove client reference
    this.call_rpc(NS_mas4h, "lost_tunnel", [client.device_key], () => {
      delete this._localClients[client.device_key];
    });
  }


  fetch_port(client, chain) {
    if(client.localPort)
      return chain(null, localPort);

    var free_port = this.free_slot();
    if(!free_port)
      chain("No more available slots");

    client.localPort = free_port;
    //register in localClient before remote ack (prevent free_port confusion) 
    this._localClients[client.device_key] = client;

    //notify central server, then attach device key
    this.call_rpc(NS_mas4h, "new_tunnel", [client.device_key, free_port], (err, ok) => {
      if(err != null) {
        delete this._localClients[client.device_key];
        return chain(err);
      }

      chain(null, free_port);
    });
  }

  //return the first available slot
  free_slot(){
    var used = [];

    forIn(this._localClients, function(client){
      used.push(client.localPort);
    });
    var min   = this.options.port_range[0],
        range = this.options.port_range[1] - min,
        start = Math.floor(Math.random() * range);
    for(var f=min+start, i=0; i< range; f=min + (start + i++)%range)
      if(!contains(used, f))
        return f;

    return false;
  }
}


module.exports = Instance;
