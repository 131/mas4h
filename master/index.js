var keys      = require('mout/object/keys');
var guid      = require('mout/random/guid');
var forIn     = require('mout/object/forIn');
var util      = require('util');

var ubkServer = require('ubk/server');
var Class     = require('uclass');

var NS_mas4h = "mas4h";


var Server = new Class({
  Extends : ubkServer,

  Binds : ['new_link', '_expand_slave'],

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




  _expand_slave : function(slave){
    var links = this.get_lnks_stats();
    return merge(slave.export_json(), {'slave_config' : slave.slave_config, 'links' : links[slave.client_key] });
  },

  reservedLnks : {},


  get_lnks_stats : function() {

    var self = this;

      //send new links to less busy node
    var links = map(self.slaves, function(v, k){ return self.reservedLnks[k] || 0 ; }) ;

    forOwn(self.lnks, function(lnk){
      links[lnk.instance.client_key] ++;
    });
    return links;
  },


    //pick a random target from slaves list
  new_link : function(chain){

    var self = this;

    var links = self.get_lnks_stats();

    var slave_id = indexOf(links, min(links)), slave = self.slaves[slave_id];
    console.log("Choosing slave_id : %s over ", slave_id, links);


    if(!slave_id)
      return chain("No available slave");

    if(!self.reservedLnks[slave_id])
      self.reservedLnks[slave_id] = 0;

    self.reservedLnks[slave_id] ++;
    setTimeout(function(){
      self.reservedLnks[slave_id] --;
    }, 2500);


    var lnk = {
      public_port : slave.slave_config.public_port,
      host        : slave.slave_config.public_addr,
      port        : 16666 //like we care
    };

    chain(null, lnk);
  },


});



module.exports = Server;
