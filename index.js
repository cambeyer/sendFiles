var DOMAIN_NAME = "cbvid.com";

var express = require('express');
var app = express();
var fs = require('fs');
var gracefulFs = require('graceful-fs');
gracefulFs.gracefulify(fs);
var busboy = require('connect-busboy');
var path = require('path');
//var http = require('http').Server(app);
var http = require("auto-sni")({
    email: "cam.beyer@gmail.com",
    agreeTos: true,
    debug: false,
    domains: [DOMAIN_NAME],
    ports: {
    	http: 8079,
        https: 8080
    }
}, app);
var io = require('socket.io')(http);

var send = require('send');

var dir = __dirname + '/files/';

var MINIMUM_READ_BUFFER_BYTES = 1000000;
var WRITE_TIMEOUT_MS = 5000;

app.use(busboy());
app.use(express.static(path.join(__dirname, 'public')));

var uploading = {};

try {
	fs.mkdirSync(dir);
} catch (e) { }

setInterval(function() {
	for (var key in uploading)
	{
		runPendingFunctions(key);
	}
}, WRITE_TIMEOUT_MS);

app.route('/upload').post(function (req, res, next) {
	req.pipe(req.busboy);
	var tempFilename = "";
	var files = {"files": []};
	req.busboy.on('file', function (field, file, filename) {
		if (filename) {
			tempFilename = filename;
			filename = Date.now();
			var downloadLink = "/download/" + filename + "/" + tempFilename;
			var pair = {};
			pair[tempFilename] = downloadLink;
			uploading[filename] = { uploaded: 0, pendingFunctions: [], complete: false };
			try { 
				console.log("Uploading: " + filename);
				var fstream = fs.createWriteStream(dir + filename);
				file.on('data', function(chunk) {
					uploading[filename].uploaded += chunk.length;
					//runPendingFunctions(filename);
				});
				file.on('end', function () { 
					console.log("Upload Finished: " + filename);
					files.files.push({
						name: tempFilename,
    					size: uploading[filename].uploaded,
    					url: downloadLink
					});
					uploading[filename].complete = true;
					runPendingFunctions(filename); //run this explicitly for faster performance (not strictly required)
				});
				file.once('readable', function() {
					io.emit('link', pair);
				})
				file.pipe(fstream);
			} catch (e) {
				console.log("Error during upload");
			}
		} else {
			file.resume();
		}
	});
	req.busboy.on('finish', function () {
		res.writeHead(200, { Connection: 'close', Location: '/' });
		res.write(JSON.stringify(files));
		res.end();
	});
});

app.get('/download/:file/:name', function(req, res){
	try {
		var filename = req.params.file;
		var realname = req.params.name;
		if (filename) {
			console.log("Downloading: " + filename);
			if (uploading[filename] && !uploading[filename].complete)
			{
				console.log("File is currently being uploaded; streaming back");
				setHeader(res, realname);
				sendFunc(filename, 0, res);
			}
			else
			{
				console.log("Already have entire file; downloading directly");
				send(req, path.resolve(dir, filename), {maxAge: '10h'})
					.on('headers', function(res) {
						setHeader(res, realname);
					})
					.on('end', function() {})
					.pipe(res);
			}
		}
	} catch (e) { console.log(e); res.redirect('back'); }
});

var setHeader = function(res, filename)
{
	res.setHeader('Content-disposition', 'attachment; filename=' + filename);
};

var runPendingFunctions = function(filename)
{
	if (uploading[filename] && uploading[filename].pendingFunctions.length > 0)
	{
		uploading[filename].pendingFunctions.pop()();
	}
};

var sendFunc = function(filename, sent, res)
{
	var uploaded = uploading[filename].uploaded;
	var complete = uploading[filename].complete;
	if (complete || uploaded - sent >= MINIMUM_READ_BUFFER_BYTES)
	{
		var stream = fs.createReadStream(dir + filename, { start: sent, end: uploaded });
		stream.on('data', function(chunk)
		{
			sent += chunk.length;
		});
		stream.on('end', function()
		{
			if (!complete)
			{
				uploading[filename].pendingFunctions.push(function()
				{
					sendFunc(filename, sent, res);
				});
				runPendingFunctions(filename);
			}
			else
			{
				console.log("Streaming back finished: " + filename);
				res.end();
				if (uploading[filename].pendingFunctions.length == 0)
				{
					delete uploading[filename];
				}
				else
				{
					runPendingFunctions(filename);
				}
			}
		});
		stream.pipe(res, {end: false});
	}
	else
	{
		runPendingFunctions(filename);
		uploading[filename].pendingFunctions.push(function()
		{
			sendFunc(filename, sent, res);
		});
	}
};

http.once("listening", ()=> {
	console.log('listening on *:' + http.address().port);
});

/*
http.listen(process.env.PORT, "0.0.0.0", function (){
	console.log('listening on *:' + process.env.PORT);
});
*/