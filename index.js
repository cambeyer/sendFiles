var express = require('express');
var app = express();
var fs = require('fs');
var busboy = require('connect-busboy');
var path = require('path');
var http = require('http').Server(app);
var send = require('send');

var dir = __dirname + '/files/';

var MINIMUM_READ_BUFFER = 1000000;

app.use(busboy());
app.use(express.static(path.join(__dirname, 'public')));

var uploading = {};

try {
	fs.mkdirSync(dir);
} catch (e) { }

app.route('/upload').post(function (req, res, next) {
	req.pipe(req.busboy);
	var tempFilename = "";
	var files = {"files": []};
	req.busboy.on('file', function (field, file, filename) {
		if (filename) {
			tempFilename = filename;
			filename = Date.now() + ".file";
			uploading[filename] = { uploaded: 0, pending: [], complete: false };
			try { 
				console.log("Uploading: " + filename);
				var fstream = fs.createWriteStream(dir + filename);
				file.on('data', function(chunk) {
					uploading[filename].uploaded += chunk.length;
					runPending(filename);
				});
				file.on('end', function () { 
					console.log("Upload Finished: " + filename);
					files.files.push({
						name: tempFilename,
    					size: uploading[filename].uploaded,
    					url: "/download/" + filename
					});
					uploading[filename].complete = true;
					runPending(filename);
					delete uploading[filename];
				});
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

app.get('/download/:file', function(req, res){
	try {
		var filename = req.params.file;
		if (filename) {
			console.log("Downloading: " + filename);
			if (uploading[filename])
			{
				console.log("File is currently being uploaded; streaming back");
				setHeader(res, filename);
				sendFunc(filename, 0, res);
			}
			else
			{
				console.log("Already have entire file; downloading directly");
				send(req, path.resolve(dir, filename), {maxAge: '10h'})
					.on('headers', function(res) {
						setHeader(res, filename);
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

var runPending = function(filename)
{
	var toRun = uploading[filename].pending.length;
	while (toRun > 0)
	{
		uploading[filename].pending.pop()();
		toRun--;
	}
};

var sendFunc = function(filename, sent, res)
{
	var uploaded = false;
	var complete = false;
	if (uploading[filename])
	{
		uploaded = uploading[filename].uploaded;
		complete = uploading[filename].complete;
	}
	if (!uploaded || complete || uploaded - sent > MINIMUM_READ_BUFFER)
	{
		var options = { start: sent };
		if (uploaded)
		{
			options.end = uploaded;
		}
		var stream = fs.createReadStream(dir + filename, options);
		stream.on('data', function(chunk)
		{
			sent += chunk.length;
		});
		stream.on('end', function()
		{
			if (!complete && uploading[filename])
			{
				uploading[filename].pending.push(function()
				{
					sendFunc(filename, sent, res);
				});
			}
			else if (!complete)
			{
				sendFunc(filename, sent, res);
			}
			else
			{
				res.end();
			}
		});
		stream.pipe(res, {end: false});
	}
	else
	{
		uploading[filename].pending.push(function()
		{
			sendFunc(filename, sent, res);
		});
	}
};

http.listen(process.env.PORT, "0.0.0.0", function (){
	console.log('listening on *:' + process.env.PORT);
});