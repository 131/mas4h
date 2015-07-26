var util = require('util'),
    fs   = require('fs');
    http = require('http');

var md5       = require('nyks/crypt/md5');
var contains  = require('mout/array/contains');
var forIn     = require('mout/object/forIn');
var ubkClient = require('ubk/client/tcp');
var Class     = require('uclass');
var SSH_Host  = require('./ssh_host.js');
var utils     = require('ssh2').utils;

var NS_mas4h = "mas4h";


var Instance = new Class({
  Extends : ubkClient,
  Binds   : [
    'validate_device',
    'lost_device',

    'free_slot',
    'fetch_port',
    'ping',
    'stop',
  ],

  _localClients : {},

  options : {
    key : null, //put server private key here
    port_range : [1000, 1020],
    ssh_port   : 443,
    ssh_addr   : '0.0.0.0',
  },

  initialize:function(options){
    var self = this;

    Instance.parent.initialize.apply(this, arguments);

    var key  = utils.parseKey(this.options.key);
    this.client_key = md5(utils.genPublicKey(key).public);


    var server = new SSH_Host(this.options.key,
        this.validate_device,
        this.fetch_port,
        this.lost_device);


    
    this.once('registered', function(){
      console.log("Registered");
      server.listen(self.options.ssh_port, self.options.ssh_addr, function() {
        server.port = this.address().port;
        self.emit("registered");
      });
    });

      //trigger every time the server is reachable
    this.on("registered", function(){
      if(!server.port)  //first round
        return;
      console.log("Sending registerration ack");
      self.send(NS_mas4h, "instance_ready", [server.port]);
    });
  },

  connect : function(chain){
    var self = this;
    Instance.parent.connect.call(this, chain, function(){
      self.stop();
      console.log("Will reconnect shortly");
      setTimeout(function(){
        self.connect(chain);
      }, 3000);
    });
  },

    //we lost main server lnk, cleaning everything up
  stop : function() {
    var self = this;
    forIn(self._localClients, function(client, client_key){
      client.destroy();
      delete self._localClients[client.device_key];
    });
  },

  validate_device : function(pubkey, chain) {
    //forward this to central server
    this.call_rpc(NS_mas4h, "validate_device", [pubkey], chain);
  },

  lost_device : function(client){
    var self = this;
    //notify central server, the remove client reference
    this.call_rpc(NS_mas4h, "lost_tunnel", [client.device_key], function(){
      delete self._localClients[client.device_key];
    });
  },

  fetch_port : function(client, chain) {
    var self = this;
    if(client.localPort)
      return chain(null, localPort);

    var free_port = self.free_slot();
    client.localPort = free_port;

    //notify central server, then attach device key
    this.call_rpc(NS_mas4h, "new_tunnel", [client.device_key, free_port], function(err, ok){
      if(err != null)
        return chain(err);

      self._localClients[client.device_key] = client;
      chain(null, free_port);
    });
  },

    //return the first available slot
  free_slot : function(){
    var self = this,
        used = [];

    forIn(self._localClients, function(client){
      used.push(client.localPort);
    });


    var min   = this.options.port_range[0],
        range = this.options.port_range[1] - min,
        start = Math.floor(Math.random() * range);
    for(var f=min+start, i=0; i< range; f=min + (start + i++)%range)
      if(!contains(used, f))
        return f;

    throw "No available port";
  },

  ping : function(device_key){
    var self = this;
    console.log(self._localClients);
    if(!self._localClients[device_key]) 
      throw "Invalid device " + device_key;
    
    self._localClients[device_key].tick = Date.now();
  },

});


module.exports = Instance;