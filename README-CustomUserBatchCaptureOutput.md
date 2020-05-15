# DacqMan (UT): CustomUserBatchCaptureOutput

## Intent (Purpose) and Catch 22's

0. As with any legacy prototyping build system that gets rev'd and updated esp
from early codebases needing to maintain back compat -- many issues and trade-offs are possible, and here are the case.  It's just what happens to be the case in this transition or migration period for code integration, to demo the
HDL hardware's data for the end-user-specific software that processes data further down the line.

1. Legacy compat - implemented here to be able to dovetail dacqman/HDL data right into a legacy workflow.
The intent is not to guide the future of development at all.  There are many options for
new methods, work flows, and updates. However, this data format and UI/UX allows
one to jump start into working with the hardware, pulling data directly into their
existing work flow.

2. Not compact or clean due to legacy compat issues
  1. eg data length and file size converting from raw to legacy 4-byte float storage for example
  2. the output file size is actually larger and more cumbersome to examine than would be a
    more plain output file that encapsulates parameters in readable json for example and then
    stores data in hex or even ascii actually as it turns out here
  2. Limitation of applying scaling within the file for example versus raw data


3. Redundancies complicating code maintenance and may include conflicting implementations
simlar names etc - for example, in this case, several duplicates and questionable overlapping
implementations (or lack of implementations) were found.  This is somewhat normal for
legacy compat of course.  Simply an illustration of how/why the current code implementation
overlay/module (shim, etc) is for demo purposes, not permanent migration.

4. Assumptions remain - like waveform lengths are calcd at init, not at each WF parse - this could be changed ...but is left because the hardware and comms process should be consistent and if it isn't an error needs to happen - at this rendering thought anyway

## Gotchas and Stuff That is Different

### Transducer Calibration Waveform Files

aka CalWaves / cal wave files / cal file / etc.

The batch output of groups of "scans" into "UTR" files historically places
a copy of the transducer calibration files and associated data into each
batch file, just after the overall file header section.

**Gotcha: TimebaseHz** In brief: Set the "sampleFrequencyHz" value inside of the
  capture options json file in the "transducersInfo" section.  Look for the
  specific and correct key.  This is used instead of "timebaseHz".


  Details: The legacy csv(ish) waveform file format (also used for
  cal waves) includes section headers (just 2), using the old Windows .ini file
  type of header format.  In the setup section is the TimebaseHz key. However,
  this value and key name seem to be implemented differently in various
  areas of code.  Timebase usually refers to a time period, like
  something in nanoseconds (ns) or seconds.  Yet a frequency value is specified
  in a csv output file.


  So, to simplify, at the moment, we just specify the overall cal file capture
  frequency in Hz in the capture options json file.  And it is simply called
  more directly: "sampleFrequencyHz".


  In any case, in more recent processing or pulse modes
  as apply here, the calibration files may not actually be a part of work flow
  or processing.  Thus, for at least initial functionality, this information may be less pertinent.


**Gotcha: TimebaseHz And Related**

BTW, the term is a bit duplicate-y imho. Timebase
is probably good, or really just sample frequency or in MHz or something - just one output file system-wide would probably best for migration.

Anyway, regarding the specific use-case of this UI/UX and data-focus captured
"mode" along with the target end-user proprietary software for which the Dacqman custom batch capture output is formatted:

That end-user software does some neat things with processing. The version used
here for testing for DacqMan module development was out of date. So this might
not apply anymore.  Please see the capture-options.json notes too.  At this time, within the code for DacqMan sample rate in mainWindow.html and elsewhere
is probably erroneously set to 25MHz because that's what the end-user software
mostly expects.  The real sample rate for the HDL software is 40MHz. It can be
changed of course.  But, if the batch capture output files are imported into the end user software with the real sample rate specific, some nice algorithms
break and create some memory issues, simply due to some upsampling and some division that results in very tiny non-integer values.  

In fact, the primary cause is simply the conversion in the C#.Net end-user code
from a single to a double float.  That conversion, by default, at least in the
C#.Net version as tested (which is fairly old) adds a tiny extra value to a
decimal place that is meaningless, but just how the conversion ends up.  This ends up getting implemented elsewhere in the code and just creates silly errors due to remainders on division.  Thus, for this release, and to fit as natively into the end-user code without modification, at least for early versions, the
sample rate is forced to appear as the nominal 25MHz to avoid the conversion error, which it turns out, doesn't happen for this value.  And right, it is not
required to add the weird decimal value in the conversion of the real sample rate.  That is, it is quite possible to represent as a double the single float
value without needing to add a tiny decimal value to the representation. Speaking strictly in terms of IEEE float implementations and binary values.

**Gotcha: Number of Channels, Sample Rate, and Waveform Length**

In the tests so far of the custom batch output file format, the waveform length
of about 4000 data points seems just fine. Not sure about actual processing or the impact of not needing to use any receive delay (because the waveforms
stabilize pretty quickly and the window is long enough that the early data can just be ignored).  However, as of this writing, it's fine and processing
in the end-user code yields real values too, again in an old version of the processing software that we're using for testing the file importation.  In the HDL's firmware, the window length could be shortened too.  It's just up to what you want.

At default, running DacqMan as it is right now, it's set up for 4 channels.
That is, channels 5 - 8 of the HDL hardware are just ignored.  That's because
the file format for legacy compat/integration expects only 4 channels. Didn't want to break anything. So if/when the end-user is ready to implement all 8 channels for example, there are a few options that can be quickly adjusted in the Dacqman code to simply enable those latter 4 channels for capture file storage.  

The target HDL hardware firmware of course could also be updated to
select what 8 channels you wanted to actually PAQ.

Stuff about the sample rate is noted above in the previous section. Just note that at default as of this writing, the HDL sample rate is 40MHz. Depending on the ADC grade selected on the HDL build configuration the sample rate could be
increased via firmware update on the hardware to probably up to about 100MHz. Or it could be slowed down.  
