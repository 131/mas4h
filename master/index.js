var keys      = require('mout/object/keys');
var guid      = require('mout/random/guid');
var forIn     = require('mout/object/forIn');
var util      = require('util');

var ubkServer = require('ubk/server');
var Class     = require('uclass');

var NS_mas4h = "mas4h";


var Server = new Class({
  Extends : ubkServer,

    //current sessions
  lnks : {},
  slaves : {}, //for ubk clients binding

  initialize:function(options) {
    var self = this;

    Server.parent.initialize.call(this, options);

    self.register_cmd(NS_mas4h, "instance_ready", function(client, query){
      if(self.slaves[client.client_key])
        return;

      console.log("GOT READY", client);
      client.remote_port = query.args[0];
      self.slaves[client.client_key] = client;
    });

    self.register_rpc(NS_mas4h, "validate_device", this.validate_device);

    self.register_cmd(NS_mas4h, "new_tunnel", function(slave, query){
      console.log("Trying to open new lnk", slave.client_key, query);
      var device_key = query.args[0], port = query.args[1];
      self.lnks[device_key] = { instance : slave, port : port };
      slave.respond(query, [null, port]);

      self.emit(util.format("%s:%s", NS_mas4h, "new_tunnel"), device_key);
    });

    self.register_rpc(NS_mas4h, "lost_tunnel", function(device_key, chain){
      console.log("Lost client ", device_key);
      delete self.lnks[device_key];
      chain();

      self.emit(util.format("%s:%s", NS_mas4h, "lost_tunnel"), device_key);
    });


    //when an instance is gone, we can assume all existings lnks are dead
    this.on("base:unregistered_client", function(client){
      delete self.slaves[client.client_key];
      forIn(self.lnks, function(lnk, lnk_id){

        if(lnk.instance.client_key == client.client_key) {
          console.log("Cleaning up deprecated lnk %s", lnk_id);
          delete self.lnks[lnk_id];
        }
      });
    });
  },


});



module.exports = Server;
