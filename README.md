
# Serial Port XPlat Dev App (aka Viffy right now)


## Specific File Notes and Setup Notes

package.json:

```bash
// electron-rebuild as an install directive for serialport with electron see:
// https://serialport.io/docs/en/guide-installation
// $ npm install --save-dev electron-rebuild
// $ npm install (to run the added install script item in package.json)
```

Was using serialport ^6.1.0


## Launching (during Dev)

Example to launch, during development (not yet packaged):

1) check npm, that it works. (check paths)
$ which npm

If it doesn't, make sure your paths are setup, try e.g.:
$ source ~/.bashrc (that is where brew installed things in my case)

2) Get into the directory of the app:
cd ~/code/myapp

3) Launch
$ npm start
Or see your package.json file for the startup scripts


## Resources:
https://electronjs.org/docs/tutorial/first-app


## FTDI Device Prep for Async 245-Style FIFO

This applies to our test application.

1. Run FT_PROG or equivalent
2. On your desired channel, if a multi-channel device:
    1. Set the mode to 245 FIFO
    2. Set the driver to D2XX
3. Program the device


## Driver Management

Mac OS X (Mojave/10.14.x)


### D2XX and VCP Current Implementation

#### FTDI D2XX Driver Installation

NOT using kext D2xxHelper.kext from FTDI (would be living in /Library/Extensions/) at this time,
and yes using the kextstat | grep FTDI which returns the com.apple.driver.FTDIUSBSerialDriver (or equivalent)
as being loaded and running.

Yes, using the FTDI files from the D2xx setup:
- ftd2xx.h
- WinTypes.h
in
/usr/local/include/

Yes, using the actual driver (current version) library file and the symlink for:
- libftd2xx.dylib (current version)
- symlink to the current version named: libftd2xx.dylib
in
/usr/local/lib/

The node-ftdi (npm install ftdi) package thus wraps the d2xx driver, and requires the headers installed
by the FTDI driver to build, and is used to access as an FtdiDevice the virtual port
instance that enumerates and handles the rapid parallel data stream from the hardware.

#### VCP

Currently, though our hard-coding tests and chopping into the node-ftdi code did
build and allow for d2xx node-ftdi use of the second enumerated port that is configured
as a serial port, it seems cleanest and most easy to configure, to use the VCP,
even the VCP variant of the enumerated control port, configured as a serial port.  
Even via the Apple USB FTDI serial (VCP) driver.  You may need to explicitly load it,
using sudo kextload -b etc etc, if you have unloaded it during d2xx installation or other
testing.

So, this Apple VCP should show up during kextstat | grep FTDI.

And thus, the 2nd enumerated device associated with the hardware, that is, number
zero or letter B (at the time of this writing) should show up both in the VCP section of the
App here as well as in the FTDI Device section.  The code at this writing will use the VCP
interface to talk to the control port.




### D2XX Details and Dev Notes

Ended up using d2xx with modified node-ftdi on Mac (so far) because baud rate
aliasing didn't seem to be working, though the notes for aliasing are still below.

For d2xx, it was not necessary to remove the FTDI VCP driver(s).  

Up to 3Mbps worked directly in node-serialport with the FTDI VCP driver, no
aliasing needed.

However, aliasing just seemed to be "dead".  That is, regardless of the output
baud selected, and regardless of the input baud selected, or even using BAUDALL,
there seemed to be no actual change in the baud rate from the selected value,
as long as the selected value was in range.

Hence, the move to node-ftdi with d2xx.  Once this could build with our newer
node version (after adjustments to code), and then also:


#### FT_PROG for Mac OS X / Linux

*TODO!* (Test out options and report back ... )

#### Installation and Setup for node-ftdi and d2xx

You can use the FTDI instructions from their website, including the video, up to
a point.  Basically, you download the ftdi d2xx driver package and copy the dynamic
lib file (dylib) into your `/usr/local/lib` and also create a symbolic link
that is version independent.  And you install the d2xx helper program, if appropriate.

Then (the video doesn't show this part because it's more needed for node-ftdi):

Copy the needed header files for the d2xx libraries into your include directory.

These files are: `ftd2xx.h` and `WinTypes.h`

The include dir was: `/usr/local/include`

In practical use here, we had already removed the Apple FTDI USB Serial driver.
Then, the same kextunload command was used to unload the FTDI VCP driver.
Now, when running the App, node-ftdi was able to see the FTDI device and
calls to `open` with a baud rate of 12Mbps for example nicely, again,
measuring the width in time of a binary `1` in 0xAA being written to the device
and read back (because the device is wired into a loopback with Tx being connected
to Rx).

So far so good.

#### Development Notes for node-ftdi

Much appreciation for the node-ftdi package!

See below for mod'ing custom variants of the package and installing.

However, AFAICT it looked like it would not install with our project's node version
(v11).  I.e. `npm install node-ftdi` hit errors upon `node-gyp` build.  Makes sense
as it's possible from the visible commit messages that Node v4/5 was the last target.
And perhaps some legacy applications still depend on this.  And v8 updates and changes
are sufficient to break things.  The solution is in the updated code used here.  Though further
updates are required to deal with some deprecations.

`npm install ../3rd-party[or whatever this directory is called]/node-fdti`

Installs the local-only node-ftdi package with the mods into our project (App)
assuming that we're cd'd into the current project dir already.

Actually, there were several warnings about NODE_MODULE_VERSION issues in the
console on App launch, so:

```bash
$ cd project-dir
$ npm rebuild
$ npm install
$ npm start
```
Did it.

In Summary:

1. Change the code in ../my3rdPartyDir/node-ftdi/src
2. Terminal/command line, already in the main project directory, and then:
3. npm install ../my3rdPartyDir/node-ftdi (triggers errors, but copies files it seems)
4. npm install (due to the inclusions in our project package.json, includes a rebuild)
5. npm start . (works, with the updates in the 3rd party project, here node-ftdi)

Requirements for the above build to work:
```bash
package.json: "ftdi": "file:../viffy-3rd/node-ftdi",
and the electron-rebuild




### Useful command examples:

```bash
(Unplug device)
$ sudo kextunload -b com.apple.driver.AppleUSBFTDI
$ sudo kextunload -b com.FTDI.driver.FTDIUSBSerialDriver
$ sudo kextcache -system-caches (not sure if required, it comes from an ORS ticket, below)
$ kextstat | grep FTDI
$ sudo kextload -b com.FTDI.driver.FTDIUSBSerialDriver
(Replug-in device)
$ kextstat | grep FTDI # use whenever needed to see what's loaded
```

### Baud Rate Aliasing in the FTDI VCP Driver

Edit the Plist.info for the driver located at:
/System/Library/Extensions/FTDIUSBSerialDriver.kext (Open Contents => Plist.info)

You can use key BAUDALL instead of e.g. B300 to map all bauds to your aliased
baud BTW.  However, so far, in Mac OS X Mojave 10.14.x, this aliasing is not working.

Heh. However it turns out in this version of everything that you can just open the
port with a baud rate of 3000000 (the maximum it would seem right now) which is nice.

However, we are looking at how to open it with a higher baud ...

Search for the matching PID and VID (convert the hex as typically displayed to
  decimal as used in the plist file) and then add the ConfigData as shown in
  FTID's baud rate aliasing and Mac driver configuration application notes.

App Note: https://www.ftdichip.com/Support/Documents/TechnicalNotes/TN_105%20Adding%20Support%20for%20New%20FTDI%20Devices%20to%20Mac%20Driver.pdf

Web resource (thanks): https://spin.atomicobject.com/2013/06/23/baud-rates-ftdi-driver-mac/

ORSSerialPort discussion: https://github.com/armadsen/ORSSerialPort/issues/18






Mac USB Tools:

$ system_profiler SPUSBDataType

$ ioreg -irc IOUSBHostDevice (or just IOUSBDevice)







## Development Notes and Reminders

Some changes show with the reload (command-R) command.

Some changes, like changing the nodeIntegration setting in the BrowserWindow
spawn do not show until exiting the application and restarting, aka "npm start"




## Security

Do use recommendations at:
https://github.com/electron/electron/blob/master/docs/tutorial/security.md
https://stackoverflow.com/questions/51969512/define-csp-http-header-in-electron-app
