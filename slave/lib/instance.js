var util = require('util'),
    fs   = require('fs');
    http = require('http');

var remove    = require('mout/array/remove');
var ubkClient = require('ubk/client/tcp');
var Class     = require('uclass');
var SSH_Host  = require('./ssh_host.js');

var NS_mas4h = "mas4h";


var Instance = new Class({
  Extends : ubkClient,
  Binds   : [
    'free_slot',
    'fetch_port',
    'ping',
  ],

  position:4,
  _localClients : {},

  _ssh_host : null,

  port_range : [1000, 1020],

  initialize:function(options){
    var self = this;

    this._ssh_host = new SSH_Host(null,
        this.validate_device,
        this.fetch_port,
        this.lost_device);

    Instance.parent.initialize.call(this, options);
  },

  validate_device : function(pubkey, chain) {
    //forward this to central server
    this.send(NS_mas4h, "validate_device", pubkey, chain);
  },

  lost_device : function(client){

    //notify central server, the remove client reference
    this.send(NS_mas4h, "lost_tunnel", {device_key:client.device_key}, function(){
      remove(self._localClients, client);
    });
  },

  fetch_port : function(client, chain) {
    var self = this;
    if(client.localPort)
      return chain(null, localPort);

    var free_port = self.free_slot();
    client.localPort = free_port;

    //notify central server, then attach device key
    this.send(NS_mas4h, "new_tunnel", {device_key:client.device_key, port:free_port}, function(){
      self._localClients.push(client);
      chain(null, free_port);
    });
  },

    //return the first available slot
  free_slot : function(){
    var self = this,
        used = [];

    Object.map(self._localClients, function(client){ used.push(client.localPort); });

    var min   = this.port_range[0],
        range = this.port_range[1] - min,
        start = Math.floor(Math.random() * range);
    for(var f=min+start, i=0; i< range; f=min + (start + i++)%range)
      if(!used.contains(f))
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