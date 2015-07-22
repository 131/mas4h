var http = require('http');

var keys      = require('mout/object/keys');
var guid      = require('mout/random/guid');

var ubkServer = require('ubk/server');
var Class     = require('uclass');

var Server = new Class({
  Extends : ubkServer,
  Binds   : ['rest'],

  options : {
    'http_port' : 6001,
  },

    //current sessions
  lnks : {},
  slaves : {}, //for ubk clients binding

  initialize:function(options) {
    var self = this;

      Server.parent.initialize.call(this, options);
      //from ubk
    console.log(this.options);
    this.slaves = this._clientsList;

    var httpServer = http.createServer(this.rest);

    httpServer.listen(this.options.http_port, function(){
      console.log("HTTP server started on port %d", self.options.http_port);
    });

    //when an instance is gone, we can assume all existings lnks are dead
    this.on("base:unregistered_client", function(client){
      Object.each(self.lnks, function(lnk, lnk_id){
        console.log("Cleaning up deprecated lnk %s", lnk_id);

        if(lnk.instance == client) {
          console.log("Cleaning up deprecated lnk %s", lnk_id);
          delete self.lnks[lnk_id];
        }
      });
    });
  },

  rest : function(req, res){
    var self = this;

    try {
      if(req.url == "/link/new") {
          var instance = keys(self.slaves).shuffle()[0];
          if(!instance)
            throw "Cannot find any instance";
          var client = self.slaves[instance];
          res.write(instance);
          var lnk_id = guid();
          console.log("New session %s", lnk_id);

          var device_key = guid(), device = {
            device_key    : device_key,
            device_pubkey : "ssh-rsa " + device_key,
          };

          client.send("mas4h", "new", {lnk_id:lnk_id, device:device}, function(){
            console.log("This is BACK FROM NEW");
            self.lnks[lnk_id] = {instance:client};
          });
      }

      if(req.url == "/link/list") {
          res.write(Object.keys(self.lnks).join(','));
      }


      res.end("THIS IS BODY" + req.url);
    } catch(e) {
      res.end(e);
    }
  },

});



module.exports = Server;
