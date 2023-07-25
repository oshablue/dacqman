let
	visa = require('./third-party-custom/ni-visa/ni-visa.js'),
	vcon = require('./third-party-custom/ni-visa/ni-visa-constants.js'),
	pause = require('./third-party-custom/ni-visa/pause.js'),
	sprintf = require('sprintf-js').sprintf

let status;
let sesn;
let resp;

let vi;

// OB NKS: See ni-visa.js for note about ffi-napi customization 
// for use with the VISA library file as now named by the NI-VISA from NI
// as installed.
// IMPORTANT note that the VISA listing reverses the words as shown here, taken from the 
// Rigol Utility => IO display
let name = 'USB0::0x0400::0x09C4::DG1F141400216::INSTR';

function testListResources() {
	[status, sesn] = visa.viOpenDefaultRM();
	console.log("Testing listing the resource scan for ni-visa");
	visa.vhListResources(sesn).forEach(address => {
		console.log(address)
		try {
			[status, vi] = visa.viOpen(sesn, address);
			resp = visa.vhQuery(vi, '*IDN?');
			console.log(resp.trim(), address);
			visa.viClose(vi);
		} catch (err) {
			console.error(err);
		}
	});
}



function testParseResource() {
	console.log("Testing parse specific resource...");
	let x, y;
	//let name = 'USB0::0x09C4::0x0400::DG1F141400216::INSTR';
	console.log(name);
	[status, x, y] = visa.viParseRsrc(sesn, name);
	console.log(status, vcon.decodeStatus(status), x, y);

	let a, b, c;
	[status, x, y] = visa.viParseRsrcEx(sesn, name); // 'USB0::0x09C4::0x0400::DG1F141400216::INSTR');
	console.log(status, vcon.decodeStatus(status), x, y, a, b, c);
}


let testOutputCh2On = "OUTP:CH2 ON"; // \n trailing added by the write code (?)
let testOutputCh2Off = "OUTP:CH2 OFF"; // same with \s space symbol?


console.log("About to open ni-visa device...");

[status, sesn] = visa.viOpenDefaultRM();		// Yes this seems necessary
[status, vi] = visa.viOpen(sesn, name);			// and then perhaps can open

resp = visa.vhQuery(vi, 'OUTP:CH2?');
console.log(`${name}: ${resp.toString()}`);

if ( resp ) {
	if ( resp.toString().trim().indexOf('ON') > -1 ) {
		visa.viWrite(vi, testOutputCh2Off);
	} else {
		visa.viWrite(vi, testOutputCh2On);
	}
}

visa.viClose(vi);
