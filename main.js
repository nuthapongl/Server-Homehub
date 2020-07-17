const express = require('express');
const firebase = require('firebase-admin');
const fs = require('fs');
const ping = require('ping');
var mqtt = require('mqtt');
const axios = require('axios');
var moment = require('moment');
// const uid = '3dbbb259-e8b5-4d75-a105-2a03b69f9aca';
const databaseURL = 'https://connectedpeaceofmind-817d4.firebaseio.com/';
const serviceAccount = require('./connectedpeaceofmind-817d4-firebase-adminsdk-38alx-fcd18fc0f0.json');
// var mqttServer = { host: '192.168.1.165', port: 1883 };
var mqttServer = 'mqtt://localhost';
// var notiTokens = [];
// var bells = [];
var bells = [];
var noOfBell = [];
var jwtToken = '';
var headers;
var configFile;

var config = {
  credential: firebase.credential.cert(serviceAccount),
  databaseURL: databaseURL
};

firebase.initializeApp(config);

// Get a reference to the database service
var database = firebase.database();
var client  = mqtt.connect(mqttServer)

init();

async function init() {
  try {
    await readFile('config.json');
  }
  catch(err) {
    console.log(err);
  }
}

client.on('connect', function () {
  client.subscribe('bell', function (err) {
    if (!err) {
      console.log(err);
    }
  })
    client.subscribe('zigbee2mqtt-hh/#', function (err) {
    if (!err) {
      console.log(err);
    }
  })
  client.subscribe('gate', function (err) {
    if (!err) {
      console.log(err);
    }
  })
})

client.on('message', function (topic, message) {
  // message is Buffer
  console.log(topic);
  console.log(message);
  if(topic === 'bell') {
      var jsonMsg = JSON.parse(message);
      console.log(jsonMsg);
      var clientId = jsonMsg.clientId;
      var replyMsg = {"clientId": clientId};
      if(jsonMsg.msg == 'connection_btn') {
        console.log('check internet status with button');
        ping.sys.probe('8.8.8.8', function(active) {
          if(active) {
            replyMsg.msg = 'ready_btn';
          }
          else {
            replyMsg.msg = 'notready_btn';
          }
          //resolve();
          // client.publish('homehub', JSON.stringify(replyMsg));
        })
      }
      else if(jsonMsg.msg == 'connection') {
        console.log('check internet status');
        ping.sys.probe('8.8.8.8', function(active) {
          if(active) {
            replyMsg.msg = 'ready';
          }
          else {
            replyMsg.msg = 'notready';
          }
          //resolve();
          // client.publish('homehub', JSON.stringify(replyMsg));
        })
      }
      else if(jsonMsg.msg == 'ringbell') {
        replyMsg.msg = 'otw';
        writeBellData(clientId, 0);
      }
      else if(jsonMsg.msg == 'callbell') {
        replyMsg.msg = 'otw';
        writeBellData(clientId, 1);
      }

      client.publish('homehub', JSON.stringify(replyMsg));

      // results.forEach(result => {
      //   var replyMsg = {"clientId":result.id};
      //   if(jsonMsg.msg == 'connection') {
      //     console.log('check internet status');
      //     ping.sys.probe('8.8.8.8', function(active) {
      //       if(active) {
      //         replyMsg.msg = 'ready';
      //       }
      //       else {
      //         replyMsg.msg = 'notready';
      //       }
      //       // client.publish('homehub', JSON.stringify(replyMsg));
      //     })
      //   }
      //   else {
      //     console.log('send bell msg');
      //     replyMsg.msg = 'otw';
	    //     writeBellData(result.id, result.device_name, jsonMsg.msg, newBellKey, notiTokens);
      //   }
      // });
  }
  else if(topic === 'gate') {
    var replyMsg = {"clientId":"1234","msg":"got message"};
    client.publish('homehub', JSON.stringify(replyMsg));
  }
  
  // console.log(message.toString())
  // console.log(topic);
  // client.end()
})


function readFile(fileName) {
  return new Promise((resolve, reject) => {
    fs.readFile(fileName, 'utf8', async function (error, data) {
      if (error) return reject(error);
      //check null
      if(data) {
        configFile = JSON.parse(data);
        const serialNo = {
          serial: configFile.uuid,
          device: 'homehub'
        }
        // axios.post(configFile.hostname + configFile.LOGIN_API, serialNo)
        //   .then(function (response) {
        //     jwtToken = response.data.token;
        //     console.log(response.data.token);
        //   })
        //   .catch(function (error) {
        //     console.log(error);
        // });
        var result = await postToServer(configFile.hostname, configFile.LOGIN_API, serialNo, false);
        jwtToken = result.token;
        console.log(jwtToken);
        headers = {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer '+ jwtToken,
        }
        waitForReply();
        waitForBellAck();
      }
      resolve();
    })
  });
}

async function writeBellData(clientId, message)  {

  // A post entry.
  var bellData = {
    msg: message, // message 0 = ring, 1 = call
    timestamp: moment().utc().format('YYYY-MM-DD HH:mm:ss'), // time
    clientId: clientId, //token
  };


  var result = await postToServer(configFile.hostname, configFile.BELLEVENTS_API, JSON.stringify(bellData), true);
  console.log(result);
  // axios.post(configFile.hostname + configFile.BELLEVENTS_API, JSON.stringify(bellData),{headers: headers})
  // .then(function (response) {
  //   console.log(response);
  // })
  // .catch(function (error) {
  //   console.log(error);
  // });
}

function waitForReply() {
  var userBellRef = database.ref('/rep/' + configFile.uuid);
  console.log("wait for "+ userBellRef)
  userBellRef.off();
  userBellRef.on("value", function(snapshot) {
      console.log(snapshot.val());
      if(snapshot.val() != null) {
        let value = snapshot.val();
        snapshot.forEach(async function(data) {
          let id = value[data.key].id;
          let from = data.key;
          var response = await getFromServer(configFile.hostname, configFile.REPLYEVENTS_API, id);
          if(response) {
            database.ref('/rep/' + configFile.uuid + '/' + from).remove();
            var replyMsg = {"clientId":id, "msg": response.message[0].message, "device":from.toLowerCase()};
            console.log(replyMsg);
            client.publish('homehub', JSON.stringify(replyMsg));
          }          
        });
      }
  });
}

function waitForBellAck() {
  var bellAckRef = database.ref('/res/' + configFile.uuid);
  bellAckRef.off();
  console.log("wait for bell ack "+ bellAckRef)
  bellAckRef.on("value", function(snapshot) {
      console.log(snapshot.val());
      if(snapshot.val() != null) {
        let value = snapshot.val();
        snapshot.forEach(function(data) {
          let id = value[data.key].id;
          let from = data.key;
          database.ref('/res/' + configFile.uuid + '/' + from).remove();
          //get client id from bell
          var replyMsg = {"clientId":id, "msg": "success", "device":from.toLowerCase()};
          console.log(replyMsg);
          client.publish('homehub', JSON.stringify(replyMsg));
        });
      }
  });
}

async function postToServer(hostname, api, body, isHeader) {
  var response;
  if(isHeader) {
    response = await axios.post(hostname + api, body, {headers: headers});
  }
  else {
    response = await axios.post(hostname + api, body);
  }
  if(response) {
    return response.data;
  }
  return 'cannot reach host';
  // axios.post(configFile.hostname + configFile.LOGIN_API, serialNo)
  //         .then(function (response) {
  //           jwtToken = response.data.token;
  //           console.log(response.data.token);
  //         })
  //         .catch(function (error) {
  //           console.log(error);
  //       });
}

async function getFromServer(hostname, api, body) {
  var response = await axios.get(hostname + api + body, {headers: headers});
  // var response = await body != null? axios.get(hostname + api, body, {headers: headers}) :  axios.get(hostname + api + body, {headers: headers});
  if(response) {
    return response.data;
  }
  return 'cannot reach host';
}

const app = express()
app.get('/', (req, res) => res.send('Hello World!'))
app.listen(3000, () => console.log('Example app listening on port 3000!'))