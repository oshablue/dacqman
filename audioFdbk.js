
// https://www.npmjs.com/package/nodesynth/v/0.6.0

/*
var NodeSynth = require('nodesynth');
require('nodesynth/notes'); // Optional

const sr = 22050;
*/

/*
var ns = new NodeSynth.Synth({bitDepth: 16, sampleRate: sr});
ns.play();



// Sweep up freq
// init example from Readme:
//ns.source = new NodeSynth.Oscillator('sin', function(t){return 440 + ((t * 50) % 220)});
const volEnvFreq = 0.2;
const endTime = (1.0/volEnvFreq);

ns.source = new NodeSynth.Oscillator('sin', function(t){
  let v = 440 + ((t * 500) % (440 * (1/t) ));
  if ( ns.time > endTime ) {    // timeStep is 1/SR
    ns.stop();
  }
  return v;
})
.multiply(new NodeSynth.Oscillator('tri', volEnvFreq).add(1).multiply(0.5));
*/


// Busy signal
/*
var o1 = new NodeSynth.Oscillator('sin', A4);
var o2 = new NodeSynth.Oscillator('sin', B5).multiply(new NodeSynth.Oscillator('sq', 1).add(1).multiply(0.5));
ns.source = o1.mix(o2);
*/

// Harsh single tone
//ns.source = new NodeSynth.Oscillator('sq', A2.perfect_unison());




/*
Using AudioContext - get issues at this version of node/Chrome etc
with not allowing autoplay and needing to handle a user event to unlock
... probably not a bad thing ... no go right now for testing though
*/

//import Envelope from 'envelope-generator';

/*
const Envelope = require('envelope-generator');

let context = new AudioContext();



let osc = context.createOscillator();

let gain = context.createGain();

let env = new Envelope(context, {
  attackTime: 0.1,
  decayTime: 3,
  sustainLevel: 0.4,
  releaseTime: 0.1
});

env.connect(gain.gain);

var startAt = context.currentTime;

var releaseAt = startAt + 0.5;

osc.start(startAt);
env.start(startAt);

env.release(releaseAt);

let stopAt = env.getReleaseCompleteTime();
osc.stop(stopAt);
env.stop(stopAt);
*/









// https://stackoverflow.com/questions/40822969/how-can-i-properly-end-or-destroy-a-speaker-instance-without-getting-illegal-ha
// https://github.com/TooTallNate/node-speaker/issues/18
// On Mac OS X - all of these create that continous buffer underflow dump output!


var Generator = require('audio-generator/stream');
var Speaker = require('audio-speaker/stream');

var PlainSpeaker = require('speaker'); ///stream');

const bufferAlloc = require('buffer-alloc');
const Readable = require('stream').Readable;
/*
var generator = require('audio-generator/pull');
var speaker = require('audio-speaker/pull');
var pull = require('pull-stream/pull');

pull(
    generator(Math.random, { duration: 2 }),
    speaker()
);
*/

let isReady = true;
let sr = 4500;
let samplesPerBuffer = 4096;
let timeoutMs = 4096 * 1.0/sr * 1000;

var playData = function(data) {

  //console.log(isReady);

  if ( !isReady ) { return; }
  isReady = false; // wait until write data

  setTimeout(function(){
      isReady = true;
  }, timeoutMs);


  // Below isn't right ... just setting up
  // const stream = new Readable();
  // stream.bitDepth = 16
  // stream.channels = 2
  // stream.sampleRate = 44100
  // stream.samplesGenerated = 0
  // stream._read = read
  // stream.pipe(new PlainSpeaker());





  // Create the Speaker instance
  // Works when using speaker.write and not the Readabe instance + pipe
  let speaker = new Speaker({
    channels: 2,
    bitDepth: 16,
    sampleRate: sr // 3000 - 384000
  });

  speaker.on('open', () => {
    console.log('Speaker open');
  })

  speaker.on('flush', () => {
    console.log('Speaker flush');
  });

  speaker.on('close', () => {
    console.log('Speaker close');
    //isReady = true; // nope
  });

  speaker.on('end', () => {
    console.log('Speaker end');
  });

  speaker.on('drain', () => {
    console.log('Speaker drain');
  });

  speaker.on('finish', () => {
    console.log('Speaker finish');
  });



  // Just rudimentary testing, and this Buffer usage is deprecated still ...
  // Just add 1 sample since incoming data is 4095 bytes
  // TODO method-ize for any not 2n length
  // Values are 0 to 255
  data2 = Buffer.concat([new Buffer(1), data]);
  data3 = Buffer.from(new Uint16Array(data2));


  // Test values
  // https://github.com/TooTallNate/node-speaker/blob/master/examples/sine.js
  const bitDepth = 16
  const channels = 2
  const n = 4096*4 // For 4095 or 6 samples coming in, at 2B per sample and 2 Chan - for this algorithm we use 4x because the PCM writing logic for 16-bit divides by 4
  const freq = 440.0
  const sampleRate = sr; // versus eg 44100
  let samplesGenerated = 0;

  const sampleSize = bitDepth / 8
  const blockAlign = sampleSize * channels
  const numSamples = n / blockAlign | 0
  const data4 = bufferAlloc(numSamples * blockAlign)
  const amplitude = 32760 // Max amplitude for 16-bit audio

  // the "angle" used in the function, adjusted for the number of
  // channels and sample rate. This value is like the period of the wave.
  const t = (Math.PI * 2 * freq) / sampleRate

  // Just testing logic for 440 Hz sounding output at selected parameters
  // for (let i = 0; i < numSamples; i++) {
  //   // fill with a simple sine wave at max amplitude
  //   for (let channel = 0; channel < channels; channel++) {
  //     const s = samplesGenerated + i
  //     const val = Math.round(amplitude * Math.sin(t * s)) // sine wave
  //     const offset = (i * sampleSize * channels) + (channel * sampleSize)
  //     data4[`writeInt${bitDepth}LE`](val, offset)
  //   }
  // }

  let i = 0;
  for (i = 0; i < numSamples; i++) {
    // fill with a simple sine wave at max amplitude
    for (let channel = 0; channel < channels; channel++) {
      const s = samplesGenerated + i
      const val = Math.round(amplitude * (data2[i]/255.0-0.5)) // sine wave
      let valFaded = i < 100 ? val * i/100 : val;
       valFaded = i > numSamples - 100 ? valFaded * (numSamples - i)/100 : valFaded;
      const offset = (i * sampleSize * channels) + (channel * sampleSize)
      data4[`writeInt${bitDepth}LE`](valFaded, offset)
      //console.log(i)
    }
  }
  //console.log(i);
  //console.log(data4);



  // This works - just a first test - mono? - nope stereo - so samples are interleaved
  // speaker.write(data3, () => {
  //   speaker.destroy(); // close is not a function unless requiring plain old speaker
  //   console.info('Speaker data written');
  // });

  // This works too - sr has a nice big impact on how you hear it etc.
  speaker.write(data4, () => {
    speaker.destroy(); // close is not a function unless requiring plain old speaker
    console.info('Speaker data written');
  });

  // not working yet
  //stream.push(data4);

}


var playOpen = function() {

  console.warn(
    "As of DacqMan 0.0.11 with included audio examples, audio-generator/stream \
    is used, and on Mac OS X 10.14.n at least, with the use of a generator or speaker \
    you will, after the generator is done, even on speaker close/destroy, etc. \
    get repeated warnings on the command line, looped spam, about buffer underrun, \
    the simplest method, and only working method, is too edit the file in the \
    node_modules/speaker package, coreaudio.c, circa line 81, to comment out the \
    warning message - there are other similar routes. But it means you cannot use \
    the default package.  You may need to npm install -g node-gyp to allow you \
    to then cd node_modules/speaker and node-gyp build to regenerate the bins \
    with this source change. Please see DacqMan source for links to the issue \
    as available and discovered in various relevant packages. Perhaps this will \
    be fixed soon in mpg123 or elsewhere."
  );

  let speaker = new Speaker();
  // Never happens btw:
  speaker.on('end', function(){
    console.log("END");
  });
  console.log(speaker);

  // Create the Speaker instance
      // let speaker = new Speaker({
      //   channels: 2,
      //   bitDepth: 16,
      //   sampleRate: 44100
      // });
      //
      // speaker.on('open', () => {
      //   console.debug('Speaker open');
      // })
      //
      // speaker.on('flush', () => {
      //   console.debug('Speaker flush');
      // });
      //
      // speaker.on('close', () => {
      //   console.debug('Speaker close');
      // });


      /*
      speaker.write(Buffer.from(new Uint16Array(100000)), () => {
        speaker.close();
        console.info('Speaker data written');
      });
      */

  var durSec = 10;


  let g = Generator(
    //Generator function, returns sample values -1..1 for channels
    function (time) {
        let v = time < 1.0 ? (0.5 * time) : 0.1 / (Math.pow(time, 3));

        v = v > 1.0 ? 1.0 : v;
        return [
            Math.sin(Math.PI * 2 * time * (439 + Math.pow(time, 8) ) ) * ( v ), //channel 1
            Math.sin(Math.PI * 2 * time * (441 - Math.pow(time, 8) ) ) * ( v ), //channel 2
        ]
    },

    {
        //Duration of generated stream, in seconds, after which stream will end.
        duration: durSec, // Infinity,

        //Periodicity of the time.
        //period: Infinity
    })
    .on('error', function (e) {
        //error happened during generation the frame
        console.log(e);
    })
    .pipe(speaker); //({
      //PCM input format defaults, optional.
        //channels: 2,
        //sampleRate: 22050, // 44100,
        //byteOrder: 'LE',
        //bitDepth: 16,
        //signed: true,
        //float: false,
        //interleaved: true,
    //}));


    setTimeout(function(){

      // only for require('speaker'):
      //speaker.close();

      // Just for testing if this would stop the console warnings about
      // buffer underruns
      speaker.destroy();

    }, durSec*1000);

}

module.exports = {
  playOpen: playOpen, // don't include () - this will execute immediately!
  playData: playData,
}
