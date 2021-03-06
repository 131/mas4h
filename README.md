# mas4h : Mass SSH revert bouncer

[mas4sh](https://github.com/131/mas4sh) is a scalable server infrastructure to connect (a lot of) remote linux (i.e. SSH capable) devices to a central server (& boucing clusters) using reverse SSH tunnels. The ssh2 crazy magic is powered by the excellent [ssh2 library](https://github.com/mscdex/ssh2) by Brian White. mas4h (& dependencies) requires ES7 capabilities.


[![Build Status](https://github.com/131/mas4h/actions/workflows/test.yml/badge.svg?branch=master)](https://github.com/131/mas4h/actions/workflows/test.yml)
[![Version](https://img.shields.io/npm/v/mas4h.svg)](https://www.npmjs.com/package/mas4h)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](http://opensource.org/licenses/MIT)


# mas4h master & slaves

mas4h master act as a dispatcher.
Remote devices (clients) ask the master (via WS, REST call, whatever suits you) for a connexion slot.
The master will answer with the public IP of the less busy slave.

Per design, it is possible for a client to connect and register reverse port forwarding on a slave (if you know it's public IP) regardless of the master dispatch.

Once a reverse port has been registered on a slave, the master keep tracks of the overall cluster status. The master expose a REST API to retrieve the cluster status 


# Minimal setup
* a master instance & and at least a slave instance
* It is possible to run the slave and the master on the same host.
* It is also possible to run multiple slaves on the same host


## Master overrides
On the master side, you'll have to implement how to lookup devices RSA public keys (and decide to accept them or not)
```
/**
*  chain : function(err, device_details)
*     device_details : {device_key : SOMEUNIQUESTRING [, whatever you want ]}
*/
async validate_device(pmas4hey) {
  return {}; //whatever you want but at least a "client_key" that will be used as unique ID for the client (i.e. pmas4hey signature)
}
```
Per design, positive responses might be cached by mas4h slaves.


# Performance considerations (tcp stack)
* You'll have 2 file descriptor (sockets) per devices (initial connexion & listening port). As nodejs is single threaded, CPU is here the most limiting factor. In our prodution environnement, we try to have less than 2k devices per slave (using low cost virtual machine)


# Client implementation recommandation
Keep it as simple as you can ! Our production implementation include a local (lookup) port forwarding and a cron to check the tunnel through it (you can implement this behavior in your slave override). This is not mandatory as SSH already provide an internal keepalive ping (and this JS implementation is instantly notified when a connexion loss/ping timeout occurs) (insert some link of perpetual remote ssh bash here)


# Security consideration
On slave, the SSH server is not bound to any bash or sh. It's just a TCP service that can run with no privilege.



# Restarting a slave
If a slave instance crash or restart, all bounded client links of this slave are dropped. Slave reconnect as soon as possible to the master and accept incoming client links.
Note : By the less busy cluster member policy, all dropped links are more enclined to reconnect to the slave they left once it comes back (as it will probably be the less busiest slave)

# Todo
* Bench & tests EC2


# Credits
* [131](https://github.com/131)
* [idjem](https://github.com/idjem)



