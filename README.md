# mas4h : Mass SSH revert bouncer

mas4sh is a scalable server infrastructure to connect (a lot of) remote linux capable devices to a central server (& boucing clusters) using reverse SSH tunnels.


# mas4h master & slaves

mas4h master act as a dispatcher. Remote devices ask the master (via WS, REST call, whatever suits you) for a connexion slot. The master will answer with the public IP of the less busy slave.

Per design, it is possible for a device to connect and register reverse port forwaring on a slave (if you know it's public IP) regardless of the master dispatch.

Once a reverse port has been registered on a slave, the master keep tracks of the overall cluster status. The master expose a REST API to retrieve the cluster status 


# Minimal setup
* A slave instance  & a master instance
* It is possible to run the slave and the master on the same host.
* It is also possible to run multiple slaves on the same host


## Master overrides
On the master side, you'll have to implement how to lookup devices RSA public keys (and decide to accept them or not)
```
/**
*  chain : function(err, device_details)
*     device_details : {device_key : SOMEUNIQUESTRING [, whatever you want ]}
*/
validate_device : function(pubkey, chain){
  //answer to chain
}
```
Per design, positive responses might be cached by mas4h slaves.


# Performance considerations (tcp stack)
* You'll have 2 file descriptor (sockets) per devices (initial connexion & listening port). As nodejs is single threaded, CPU is here the most limiting factor. In our prodution environnement, we try to have less than 2k devices per slave (using low cost virtual machine)
=> We should benchmark EC2 instances


# Client implementation recommandation

Keep it as simple as you can ! Our production implementation include a local (lookup) port forwarding and a cron to check the tunnel through it (you can implement this behavior in your slave override). This is not mandatory as SSH already provide an internal keepalive ping (and this JS implementation is instantly notified when a connexion loss/ping timeout occurs) (insert some link of perpetual remote ssh bash here)


# Security consideration
On slave, the SSH server is not bound to any bash or sh. It's just a TCP service that can run with no privilege.


# Restarting master
If the master service instance crash or restart, all currently bounded links (to all slaves) are dropped. Slaves reconnect automaticly to the master as soon as possible.


# Restarting a slave
If a slave instance crash or restart, all bounded links to this slave are dropped. Slave reconnect as soon as possible to the master and accept incoming links.
Note : per load balancy to the less busy cluster member policy, all dropped links are more enclined to reconnect to the slave they left once it comes back (as it will probably be the less busiest slave)


