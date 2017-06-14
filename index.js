var express = require('express');
var app = express();
var fs = require('fs');
var busboy = require('connect-busboy');
var path = require('path');
var http = require('http').Server(app);
var devnull = require('dev-null');

var dir = __dirname + '/files/';

app.use(busboy());
app.use(express.static(path.join(__dirname, 'public')));

var uploading = {};

try {
	fs.mkdirSync(dir);
} catch (e) { }

app.route('/upload').post(function (req, res, next) {
	req.pipe(req.busboy);
	var tempFilename = "";
	req.busboy.on('file', function (field, file, filename) {
		if (filename) {
			filename = Date.now() + ".file";
			tempFilename = filename;
			uploading[filename] = { uploaded: 0, pending: [] };
			try { 
				console.log("Uploading: " + filename);
				var fstream = fs.createWriteStream(dir + filename);
				file.on('data', function(chunk) {
					uploading[filename].uploaded += chunk.length;
					while (uploading[filename].pending.length > 0)
					{
						uploading[filename].pending.pop()();
					}
				});
				fstream.on('close', function () { 
					console.log("Upload Finished of " + filename);
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
		delete uploading[tempFilename];
		res.writeHead(200, { Connection: 'close', Location: '/' });
		res.end();
	});
});

app.get('/download/:file', function(req, res){
	try {
		var filename = req.params.file;
		if (filename) {
			console.log("Downloading: " + filename);
			res.setHeader('Content-disposition', 'attachment; filename=' + filename);
			if (uploading[filename])
			{
				console.log("File is currently being uploaded; streaming back");
				sendFunc(filename, 0, res);
			}
			else
			{
				console.log("Already have entire file; downloading directly");
				var filestream = fs.createReadStream(dir + filename);
				filestream.pipe(res);
			}
		}
	} catch (e) { console.log(e); res.redirect('back'); }
});

var sendFunc = function(filename, sent, res)
{
	var uploaded = null;
	try
	{
		uploaded = uploading[filename].uploaded;
	}
	catch (e) { }
	if (!uploaded || uploaded - sent > 0)
	{
		var options = { start: sent };
		if (uploaded)
		{
			options.end = uploaded;
		}
		else
		{
			console.log("Upload complete; sending remainder of file");
		}
		var stream = fs.createReadStream(dir + filename, options);
		stream.on('data', function(chunk)
		{
			sent += chunk.length;
		});
		stream.on('end', function()
		{
			if (uploaded)
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