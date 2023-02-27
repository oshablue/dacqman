
/*
Copyright 2020 ali matinfar / alimat

[ISC License from the original work included here in this file only.  Original upsample@1.2.3 from npmjs.com.]

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee 
is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE 
INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE 
FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM 
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, 
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

===

Copyright 2023 oshablue / nks - modifications:
only for modifications to the original upsample.js as noted above.
- doWavHeader
- move from npm module to plain js file included in the project
- ISC license retained for this file

*/

let INITIAL_NUMERATOR_UPSAMPLE = [0, 1.6344e-06, -1.3929e-20, -1.5509e-05, -4.0224e-05, -4.5982e-05, 4.7602e-19, 9.7257e-05, 0.00018729, 0.00017511, -3.9189e-19, -0.00028703, -0.00050711, -0.00044227, 8.4101e-19, 0.000652, 0.0011049, 0.00092935, -1.5214e-18, -0.0012896, -0.0021302, -0.0017506, 2.4551e-18, 0.0023329, 0.0037859, 0.0030611, -3.6255e-18, -0.0039651, -0.0063562, -0.0050829, 4.9681e-18, 0.006465, 0.01029, 0.0081824, -6.3721e-18, -0.010341, -0.016455, -0.013111, 7.6941e-18, 0.016784, 0.027032, 0.021913, -8.7808e-18, -0.029691, -0.050039, -0.043226, 9.4959e-18, 0.07394, 0.15813, 0.22471, 0.25, 0.22471, 0.15813, 0.07394, 9.4959e-18, -0.043226, -0.050039, -0.029691, -8.7808e-18, 0.021913, 0.027032, 0.016784, 7.6941e-18, -0.013111, -0.016455, -0.010341, -6.3721e-18, 0.0081824, 0.01029, 0.006465, 4.9681e-18, -0.0050829, -0.0063562, -0.0039651, -3.6255e-18, 0.0030611, 0.0037859, 0.0023329, 2.4551e-18, -0.0017506, -0.0021302, -0.0012896, -1.5214e-18, 0.00092935, 0.0011049, 0.000652, 8.4101e-19, -0.00044227, -0.00050711, -0.00028703, -3.9189e-19, 0.00017511, 0.00018729, 9.7257e-05, 4.7602e-19, -4.5982e-05, -4.0224e-05, -1.5509e-05, -1.3929e-20, 1.6344e-06, 0];

module.exports = upsample = (data, UPSAMPLE_RATIO = 2, doWavHeader = true, NUMERATOR_UPSAMPLE = INITIAL_NUMERATOR_UPSAMPLE, DENOMINATOR_UPSAMPLE = [1]) => {
    //start upSampling


    // let dataLen = data.length
    // let sub = (dataLen - 22) * 2

    let wavheader = data.slice(0, 22); // slice: original array not modified

    console.log(data.length)


    let originalDoublesData = data; 
    if ( doWavHeader) {
        originalDoublesData = data.slice(22);
    }

    let len = originalDoublesData.length * UPSAMPLE_RATIO - UPSAMPLE_RATIO + 1;
    let upSampledDoublesData = new Float64Array(len);

    for (var i = 0; i < originalDoublesData.length; i++) {
        upSampledDoublesData[i * UPSAMPLE_RATIO] = originalDoublesData[i];
    }

    upSampledDoublesData = filtFilt(NUMERATOR_UPSAMPLE, DENOMINATOR_UPSAMPLE, upSampledDoublesData, true);

    let convertedUpSample = upSampledDoublesData.map(convert)
    let orginalUpSampledData = new Int16Array(convertedUpSample)

    const int32toint16 = (x) => {
        let int32 = new Int32Array([x])
        return new Int16Array(int32.buffer)
    }

    let chunkSize = int32toint16((orginalUpSampledData.length * 2) + 44 - 8)
    let subChunk2Size = int32toint16(orginalUpSampledData.length * 2)

    if ( doWavHeader ) {
        wavheader[2] = chunkSize[0]
        wavheader[3] = chunkSize[1]
        wavheader[12] = wavheader[12] * UPSAMPLE_RATIO
        wavheader[14] = wavheader[14] * UPSAMPLE_RATIO
        wavheader[20] = subChunk2Size[0]
        wavheader[21] = subChunk2Size[1]
    }

    // let str = ''
    // for (let i of wavheader) {
    //   str += i + '\n';
    // }
    // let a = document.createElement('a');
    // a.href = "data:application/octet-stream," + encodeURIComponent(str);
    // a.download = 'abc.txt';
    // a.click();


    let upSampled;
    if ( doWavHeader) {
        upSampled = new Int16Array([...wavheader, ...orginalUpSampledData]);
    } else {
        upSampled = new Int16Array(orginalUpSampledData); // SP (!)
    }

    return upSampled;
}

const convert = (n) => {
    var v = n < 0 ? n * 32768 : n * 32767;       // convert in range [-32768, 32767]
    return parseInt(v); // clamp
}

const filtFilt = (b, a, rawData, doNormalize) => {
    //First index of a must be 1 --> a = a(:)/a(1) --> b = b(:)/a(1) ((MATLAB SYNTAX))
    // a is DENOMINATOR          b is NUMERATOR
    let len_buffer = rawData.length;
    let len_a = a.length;
    let len_b = b.length;
    let nfilt = Math.max(len_a, len_b);
    let nfact = 3 * (nfilt - 1);   // length of edge transients
    // if (len_buffer<=nfact)    % input data too short!
    // error('Data must have length more than 3 times filter order in Fir Filter .');
    // end
    /////////////////////////////////////////////////////////////

    //////////Prepare for Filtering
    let X = new Float64Array(len_buffer + nfact * 2);
    let len_X = X.length;
    for (let i = 0; i < nfact; i++) {
        ////////// IN some case need First Equ. but in General case use Second Equ.

        // First Equ
        // X[i] = 2 * x[0] - x[nfact - i];
        // X[len_X - 1 - i] = 2 * x[len_buffer - 1] - x[len_buffer - 2 - i];
        // Second Equ
        X[i] = -rawData[nfact - i];
        X[len_X - 1 - i] = -rawData[len_buffer - 2 - i];
    }
    // System.arraycopy(rawData, 0, X, nfact, len_buffer);
    for (let i = 0; i < len_buffer; i++) {
        X[nfact + i] = rawData[0 + i]
    }
    //////////////////////////////////////////////////////////////

    ////////// Filtering
    // Filter, reverse data, filter again, and reverse data again
    /// First Filter
    let X2 = new Float64Array(nfilt - 1 + len_X);
    // System.arraycopy(X, 0, X2, nfilt - 1, len_X);
    for (let i = 0; i < len_X; i++) {
        X2[nfilt - 1 + i] = X[0 + i]
    } //for full convolution zero padding

    let yfilt1 = new Float64Array(len_X + len_a - 1);
    let yfilt1_reverse = new Float64Array(len_X + nfilt - 1); //for full convolution zero padding
    let matrixMult = 0;
    for (let i = 0; i < len_b; i++) {
        matrixMult += b[len_b - 1 - i] * X2[i];
    }
    yfilt1[len_a - 1] = matrixMult;
    yfilt1_reverse[len_X + nfilt - 2] = yfilt1[len_a - 1];
    for (let i = 1; i < len_X; i++) {
        let matrixMult_b = 0;
        let matrixMult_a = 0;
        for (let j = 0; j < len_b; j++) {
            matrixMult_b += b[len_b - 1 - j] * X2[i + j];
        }
        for (let j = 0; j < len_a - 1; j++) {
            matrixMult_a += a[len_a - 1 - j] * yfilt1[i + j];
        }
        yfilt1[i + len_a - 1] = matrixMult_b - matrixMult_a;
        yfilt1_reverse[len_X + nfilt - i - 2] = yfilt1[i + len_a - 1];
    }
    //////////////////////////////////////////////////////////

    /// Second Filter
    let yfilt2 = new Float64Array(len_X + len_a - 1);
    let yfilt2_reverse = new Float64Array(len_X);
    matrixMult = 0;
    for (let i = 0; i < len_b; i++) {
        matrixMult += b[len_b - 1 - i] * yfilt1_reverse[i];
    }
    yfilt2[len_a - 1] = matrixMult;
    yfilt1_reverse[len_X - 1] = yfilt2[len_a - 1];
    for (let i = 1; i < len_X; i++) {
        let matrixMult_b = 0;
        let matrixMult_a = 0;
        for (let j = 0; j < len_b; j++) {
            matrixMult_b += b[len_b - 1 - j] * yfilt1_reverse[i + j];
        }
        for (let j = 0; j < len_a - 1; j++) {
            matrixMult_a += a[len_a - 1 - j] * yfilt2[i + j];
        }
        yfilt2[i + len_a - 1] = matrixMult_b - matrixMult_a;
        yfilt2_reverse[len_X - i - 1] = yfilt2[i + len_a - 1];
    }
    //////////////////////////////////////////////////////////////

    ////////// Remove extrapolated pieces of final data (yfilt2_reverse -> filteredData)
    let filteredData = new Float64Array(len_buffer);

    // System.arraycopy(yfilt2_reverse, nfact, filteredData, 0, len_buffer);
    for (let i = 0; i < len_buffer; i++) {
        filteredData[0 + i] = yfilt2_reverse[nfact + i]
    }
    //////////////////////////////////////////////////////////////
    if (doNormalize) {
        ////////// Normalize between -1, 1
        let maxValue = 0;

        for (let upSampledDoublesDatum of filteredData) {

            let absValue = Math.abs(upSampledDoublesDatum);
            if (absValue > maxValue) {
                maxValue = absValue;
            }

        }

        for (let i = 0; i < len_buffer; i++) {

            filteredData[i] = filteredData[i] / maxValue;
        }
    }
    return filteredData;
}
