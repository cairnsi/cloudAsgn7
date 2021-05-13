const express = require('express');
const app = express();
var handlebars = require('express-handlebars').create({defaultLayout:'main'});
const path = require(`path`);
const bodyParser = require('body-parser');
const {Datastore} = require('@google-cloud/datastore');
const datastore = new Datastore();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(__dirname + '/public'));
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');
app.enable('trust proxy');
var request = require('request');

const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

var redirect_uri= "http://localhost:8080/oauth";//"https://assignment3-310600.wn.r.appspot.com/oauth";
var client_id = "205778696670-o4fnne712asg8o31d4sh0l38h8c87nn1.apps.googleusercontent.com";
var scope = "https://www.googleapis.com/auth/userinfo.profile";
client_secret = "1BEZL9KkMDhb9p6LqLFvg2nh";
const STATE_Key= "STATE";
const BOAT = "boat";

const {OAuth2Client} = require('google-auth-library');
const client = new OAuth2Client(client_id);
/*async function verify(idToken, audience) {
  const ticket = await client.verifyIdToken({
      idToken,
      audience,  // Specify the CLIENT_ID of the app that accesses the backend
      // Or, if multiple clients access the backend:
      //[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3]
  });
  const payload = ticket.getPayload();
  const userid = payload['sub'];
  // If request specified a G Suite domain:
  // const domain = payload['hd'];
}
verify().catch(console.error);*/


function fromDatastore(item){
    item.id = item[Datastore.KEY].id;
    return item;
	
}

async function checkState(state){
	const q = datastore.createQuery(STATE_Key);
	entities = await datastore.runQuery(q);
	states = entities[0];
	states = states.map(fromDatastore);
	foundState = false;
	id = null;
	states.forEach(function(ele) {
		if(ele.state == state){
			foundName = true;
			id = ele.id;
		}
	});
	if(foundName){
		const key = datastore.key([STATE_Key, parseInt(id,10)]);
		var [ele] = await datastore.get(key);
		await datastore.delete(key);
	}
	return foundName;
	
}

//////////////////////////////BOAT Functions
function post_Boat(name, type, length, ispublic, owner){
    var key = datastore.key(BOAT);
	const new_Boat = {"name": name, "type": type, "length": length, "public":ispublic, "owner":owner};
	return datastore.save({"key":key, "data":new_Boat}).then(() => {return key});
}

function get_Boats(){
	const q = datastore.createQuery(BOAT);
	return datastore.runQuery(q).then( (entities) => {
			output = entities[0].map(fromDatastore);
			output = output.map(boatSelf);
			return output;
		});
}

async function get_Boat(key){
	var [boat] = await datastore.get(key);
	if(boat == null){
		return null;
	}
	boat.id = key.id;
	return boat;
}

async function delete_Boat(id){
    const key = datastore.key([BOAT, parseInt(id,10)]);
    return datastore.delete(key);
}


/////////////////////////////End Boat Functions

app.get('/',function(req,res){
  var context = {};
   res.render('Home',context);
});

app.get('/oauth',function(req,res){
  if(!checkState(req.query.state)){
		error = {"Error": "The state value was not correct. "}
		res.status(400).send(error);
		return;
  }
   var context = {};
   
   var body = 'code=' + req.query.code +'&client_id=' + client_id + '&client_secret=' + client_secret + '&redirect_uri=' + redirect_uri + '&grant_type=authorization_code';
  
  request.post({
  headers: {'content-type' : 'application/x-www-form-urlencoded'},
  url:     'https://oauth2.googleapis.com/token',
  body:    body
	}, function(error, response, body){
	  var obj = JSON.parse(body);
	  var JWTtoken = obj.id_token;
	  var token = 'Bearer ' + obj.access_token;
	  request.get({
	  headers: {'Authorization': token},
	  url:     'https://people.googleapis.com/v1/people/me?personFields=names',
	  body: ""
		}, function(error, response, body){
		    var obj = JSON.parse(body);
			context.firstName = obj.names[0].givenName;
			context.lastName = obj.names[0].familyName;
			context.id_token = JWTtoken;
			res.render('Shred',context);
		});
	});
	
});

app.post('/Authenticate', async function(req,res){
	
	var state = "state" + Math.floor(Math.random() * 1000000); 
	var key = datastore.key(STATE_Key);
	const new_State = {"state": state};
	await datastore.save({"key":key, "data":new_State});
	
   res.writeHead(301,
  {Location: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + client_id + '&scope=' + scope + '&redirect_uri=' + redirect_uri + '&state=' + state + '&response_type=code'}
);
res.end();
});


app.post('/boats', async (req, res) => {
	idToken = req.header('authorization');
	if(!idToken){
		error = {"Error": "token is not present"}
		res.status(401).send(error);
		return;
	}
	idToken = idToken.replace('Bearer ','');
	userid = null;
	//console.log(idToken);
	try{
	const ticket = await client.verifyIdToken({idToken,client_id});
	const payload = ticket.getPayload();
	userid = payload['sub'];
	//console.log(userid);
	} catch (error) {
		//console.error(error);
		error = {"Error": "token is not valid"}
		res.status(401).send(error);
		return;
	}
	if(!req.body.name || !req.body.type || !req.body.length || req.body.public == undefined){
		error = {"Error": "The request object is missing at least one of the required attributes"}
		res.status(400).send(error);
		return;
	}
	else{
	post_Boat(req.body.name, req.body.type, req.body.length, req.body.public, userid)
    .then( key => {get_Boat(key).then(data => {res.status(201).send(data)});
		});
	}
});

app.delete('/boats/:id', async (req, res) => {
	idToken = req.header('authorization');
	if(!idToken){
		error = {"Error": "token is not present"}
		res.status(401).send(error);
		return;
	}
	idToken = idToken.replace('Bearer ','');
	userid = null;
	//console.log(idToken);
	try{
	const ticket = await client.verifyIdToken({idToken,client_id});
	const payload = ticket.getPayload();
	userid = payload['sub'];
	//console.log(userid);
	} catch (error) {
		//console.error(error);
		error = {"Error": "token is not valid"}
		res.status(401).send(error);
		return;
	}
	const key = datastore.key([BOAT, parseInt(req.params.id,10)]);
	boat = await get_Boat(key);
	if(boat == null){
		error = {"Error": "No boat with this boat_id exists"  }
		res.status(403).send(error);
		return;
	}
	else if(boat.owner!=userid){
		error = {"Error": "You are not an owner of this boat"  }
		res.status(403).send(error);
		return;
	}
	else{
		delete_Boat(req.params.id).then(res.status(204).end());
	}
});


// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
var server = app.listen(PORT, () => {
});