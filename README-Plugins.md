## Overview

Plugin wrappers should contain the template functions necessary to be loaded by DacqMan. See ./plugins/dummyWrapper.js or other examples in the plugins directory.

1. Use asar option to package while keeping the plugins directory plainly exposed within the bundled app.
1. Add your custom plugins (e.g. dlls) and wrappers (e.g. wrapper.js) into the plugins directory, next to each other, same level of heirarcy, not nested.
    - If you plugins require additional files, e.g. in the ./user-data/ then it is suggested to keep those directories also out of the asar package (placed rather into unpacked) and add those. Unless you are using the preferences override to set a custom user-data directory for files, if that feature is available.
3. DacqMan checks the plugins directory for .js wrappers and loads them on startup.

## TODO 

- Unpack the user-data or ensure using __dirname or whatever handles that for customized example from user needed for their implementation - verify with them