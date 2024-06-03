'use strict';

const util        = require('util');
const min         = require('mout/object/min');
const indexOf     = require('nyks/object/indexOf');
const map         = require('mout/object/map');
const filter      = require('mout/object/filter');
const forOwn      = require('mout/object/forOwn');
const forIn       = require('mout/object/forIn');
const debug       = require('debug')('mas4h:master');

const ubkServer = require('ubk/server');

const NS_mas4h = "mas4h";

class Server extends ubkServer {
  constructor(options) {
    super(options);
    this.lnks         = {};
    this.slaves       = {};
    this.reservedLnks = {};

    this.register_client_rpc(NS_mas4h, "instance_ready", ({client}, slave_key, remote_port, client_links) => {
      if(this.slaves[slave_key])
        throw `Instance already registered`;

      this.slaves[slave_key] = client;
      this.slaves[slave_key].remote_port = remote_port;

      for(let link of client_links)
        this.lnks[link.client_key] = {...link, instance : this.slaves[slave_key]};
      return true;
    });

    this.register_rpc(NS_mas4h, "new_tunnel", (slave_key, link) => {

      debug(`Trying to open new lnk slave_key:${slave_key}, device_key:${link.client_key} on port:${link.port}`);

      if(this.lnks[link.client_key])
        throw `${link.client_key} already connected`;

      this.lnks[link.client_key] =  {...link, instance : this.slaves[slave_key]};
      this.emit(util.format("%s:%s", NS_mas4h, "new_tunnel"), link.client_key);
      return link.port;
    });

    this.register_rpc(NS_mas4h, "validate_client", this.validate_device.bind(this));

    this.register_client_rpc(NS_mas4h, "lost_tunnel", ({client}, device_key) => {
      let current = this.lnks[device_key];

      if(current && current.instance.client_key != client.client_key) {
        debug("Keeping currently connected device %s (bound to %s)", device_key, current.instance.client_key);
        return false;
      }

      debug("Lost client ", device_key);

      delete this.lnks[device_key];
      this.emit(util.format("%s:%s", NS_mas4h, "lost_tunnel"), device_key);
      return true;
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

  get_lnks_stats(region) {
    //send new links to less busy node
    const slaves = region ? filter(this.slaves, ({slave_config = {}}) => slave_config.region == region) : this.slaves;
    var links = map(slaves, (v, k) => { return this.reservedLnks[k] || 0; });
    forOwn(this.lnks, function(lnk) {
      if(links[lnk.instance.client_key] != undefined)
        links[lnk.instance.client_key]++;
    });
    return links;
  }

  //pick a random target from slaves list
  new_link(region) {
    var links = this.get_lnks_stats(region);
    debug(links);
    var slave_id = indexOf(links, min(links));
    var slave = this.slaves[slave_id];
    debug("Choosing slave_id : %s over ", slave_id, links);

    if(!slave_id)
      throw "No available slave";

    if(!this.reservedLnks[slave_id])
      this.reservedLnks[slave_id] = 0;

    this.reservedLnks[slave_id]++;
    setTimeout(() => {
      this.reservedLnks[slave_id]--;
    }, 2500);

    var lnk = {
      public_port : slave.slave_config.public_port,
      host : slave.slave_config.public_addr,
      port : 16666 //like we care
    };

    return lnk;
  }

  _expand_slave(slave) {
    var links = this.get_lnks_stats();
    return {'slave_config' : slave.slave_config, 'links' : links[slave.client_key], ...slave.export_json() };
  }

}

module.exports = Server;
