# DacqMan (UT): CustomUserBatchCaptureOutput

## Intent (Purpose) and Catch 22's

0. As with any legacy prototyping build system that gets rev'd and updated esp
from early codebases needing to maintain back compat -- issues many possible

1. Legacy compat

2. Not compact or clean due to legacy compat issues
- eg data length and file size converting from raw to legacy 4-byte float storage for example
- Limitation of scaling within the file for example

3. Redundancies complicating code maintenance and may include conflicting implementations
simlar names etc

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
