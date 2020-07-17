const express = require('express');
const firebase = require('firebase-admin');
const fs = require('fs');
var mqtt = require('mqtt')
var moment = require('moment');
const databaseURL = 'https://connectedpeaceofmind-mtec.firebaseio.com/';
const serviceAccount = require('./connectedpeaceofmind-mtec-firebase-adminsdk-bz0jg-3233a6e779.json');
const uid = '3dbbb259-e8b5-4d75-a105-2a03b69f9aca';

var notiToken = '';
var notiTokens = [];

var config = {
  credential: firebase.credential.cert(serviceAccount),
  databaseURL: databaseURL
};

firebase.initializeApp(config);

// Get a reference to the database service
var database = firebase.database();
var client  = mqtt.connect('mqtt://localhost')

init();

async function init() {
  try {
    await readFile('config.json');
  }
  catch(err) {
    console.log(err);
  }
  userEventTrigger();
}

client.on('connect', function () {
  console.log('Client connected! Subscribing to /bell')
  client.subscribe('bell')
})

client.on('message', function (topic, message) {
  if (topic === 'bell') {
     writeBellData(uid,'กำลังติดต่อครับ');
  }
  console.log('New Message:')
  console.log('-> ' + message.toString())
  // client.end()
})

function readFile(fileName) {
  return new Promise((resolve, reject) => {
    fs.readFile(fileName, 'utf8', function (error, data) {
      if (error) return reject(error);
      let configFile = JSON.parse(data);
      configFile.forEach(item => {
        notiTokens.push(item['token']);
      });
      // console.log(configFile[0]);
      // console.log(configFile[0]);
      // notiToken = configFile['token'];
      resolve();
    })
  });
}

function writeBellData(uid, message)  {
  console.log(uid);
  // A post entry.
  var bellData = {
    m: 1, // message 0 = waiting message , 1 = กำลังติดต่อต้นครับ
    t: moment().utc().format('YYYY-MM-DD hh:mm:ss'), // time
    to: notiTokens, //token
  };


  // Get a key for a new Post.
  var newBellKey = database.ref().child('b').push().key;
  var bellKey = newBellKey;

  // Write the new bell's data simultaneously in the bells list and the user's bell list.
  var updates = {};
  // updates['/bells/' + newBellKey] = bellData;
  updates['/u-b/' + uid + '/' + newBellKey] = bellData;
  database.ref().update(updates).then(() => {
    waitForReply(bellKey);
  }).catch(error => {
    console.log(error);
  });
}

function waitForReply(bellKey) {
  var userBellRef = database.ref('/b-u/' + uid);
  userBellRef.orderByChild('bId').equalTo(bellKey).on("value", function(snapshot) {
      console.log(snapshot.val());
      if(snapshot.val() != null) {
        let value = snapshot.val();
        snapshot.forEach(function(data) {
          let message = value[data.key].r;
          client.publish('homehub', message.toString());
        });
      }
  });
}

function userEventTrigger() {
  var userBellRef = database.ref('u/' + uid);
  userBellRef.on("value", function(snapshot) {
    console.log(snapshot.val());
    if(snapshot.val() != null) {
      let data = JSON.stringify(snapshot.val(), null, 2);
      notiToken = data.token;
      fs.writeFile("config.json", data, function(err) {
        if(err) {
            return console.log(err);
        }
        console.log("The file was saved!");
      });
    }
  });
}

const app = express()
app.get('/', (req, res) => res.send('Hello World!'))
app.listen(80, () => console.log('app listening on port 80!'))
