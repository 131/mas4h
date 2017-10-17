'use strict';

const util        = require('util');
const min         = require('mout/object/min');
const indexOf     = require('nyks/object/indexOf');
const map         = require('mout/object/map');
const merge       = require('mout/object/merge');
const forOwn      = require('mout/object/forOwn');
const forIn       = require('mout/object/forIn');
const debug       = require('debug')('mas4h:master');

const ubkServer = require('ubk/server');

const NS_mas4h = "mas4h";

class Server extends ubkServer{
  constructor(options){
    super(options)
    this.lnks         = {};
    this.slaves       = {};
    this.reservedLnks = {};
    this.register_cmd(NS_mas4h, "instance_ready", (client, query) => {
      if(this.slaves[client.client_key])
        return;
      client.remote_port = query.args[0];
      this.slaves[client.client_key] = client;
    });

    this.register_cmd(NS_mas4h, "new_tunnel", (slave, query) => {
      debug("Trying to open new lnk", slave.client_key, query);
      var device_key = query.args[0], port = query.args[1];
      this.lnks[device_key] = { instance : slave, port : port };
      slave.respond(query, port);
      this.emit(util.format("%s:%s", NS_mas4h, "new_tunnel"), device_key);
    });

    this.register_rpc(NS_mas4h, "validate_device", this.validate_device.bind(this));

    this.register_rpc(NS_mas4h, "lost_tunnel", (device_key) => {
      debug("Lost client ", device_key);
      delete this.lnks[device_key];
      this.emit(util.format("%s:%s", NS_mas4h, "lost_tunnel"), device_key);
      return Promise.resolve(true);
    });

    //when an instance is gone, we can assume all existings lnks are dead
    this.on("base:unregistered_client", (client) => {
      delete this.slaves[client.client_key];
      forIn(this.lnks, (lnk, lnk_id) => {
        if(lnk.instance.client_key == client.client_key) {
          debug("Cleaning up deprecated lnk %s", lnk_id);
          delete this.lnks[lnk_id];
        }
      });
    });
  }

  get_lnks_stats() {
    //send new links to less busy node
    var links = map(this.slaves, (v, k) => { return this.reservedLnks[k] || 0 ; }) ;
    forOwn(this.lnks, function(lnk){
      links[lnk.instance.client_key] ++;
    });
    return links;
  }
  
  //pick a random target from slaves list
  new_link(){
    var links = this.get_lnks_stats();
    debug(links)
    var slave_id = indexOf(links, min(links)), slave = this.slaves[slave_id];
    debug("Choosing slave_id : %s over ", slave_id, links);

    if(!slave_id)
      throw "No available slave";

    if(!this.reservedLnks[slave_id])
      this.reservedLnks[slave_id] = 0;

    this.reservedLnks[slave_id] ++;
    setTimeout(() => {
      this.reservedLnks[slave_id] --;
    }, 2500);

    var lnk = {
      public_port : slave.slave_config.public_port,
      host : slave.slave_config.public_addr,
      port : 16666 //like we care
    };

    return lnk;
  }

  _expand_slave(slave){
    var links = this.get_lnks_stats();
    return merge({'slave_config' : slave.slave_config, 'links' : links[slave.client_key] }, slave.export_json());
  }

}

module.exports = Server;
