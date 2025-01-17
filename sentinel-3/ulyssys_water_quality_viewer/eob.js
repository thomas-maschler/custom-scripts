//VERSION=3
const PARAMS = {
    // Indices
    chlIndex: 'default',
    tssIndex: 'default',
    watermaskIndices: ['ndwi', 'hol'],
    // Limits
    chlMin: -0.005,
    chlMax: 0.05,
    tssMin: 0.075,
    tssMax: 0.185,
    waterMax: 0,
    cloudMax: 0.02,
    // Graphics
    foreground: 'default',
    foregroundOpacity: 1.0,
    background: 'default',
    backgroundOpacity: 1.0
};
const isSentinel3 = true;
//* PARAMS END

const nOut = (PARAMS.chlIndex === "default") + (PARAMS.tssIndex === "default");

function setup() {
    return {
        input: ["B04", "B05", "B06", "B07", "B08", "B09", "B10", "B11", "B12", "B14", "B16", "B17", "B18", "B20", "B21", "dataMask"], // You need to add here all the bands you are going to use
        output: [
            { id: "default", bands: 3 },
            { id: "index", bands: nOut, sampleType: "FLOAT32" },
            { id: "eobrowserStats", bands: nOut + 1, sampleType: 'FLOAT32' },
            { id: "dataMask", bands: 1 }
        ]
    };
}

/**
 * Returns indices object used for output calculation
 * The returned object is different for Sentinel-2 and Sentinel-3 satellites
  * Here only defined as strings and gets evaluated only when really needed
 * (Tip 4: Calculate as needed at https://medium.com/sentinel-hub/custom-scripts-faster-cheaper-better-83f73894658a)
 * natural: natural (rgb) color image
 * chl: chlorophyll indices
 * tss: sediment indices
 * watermask: watermask indices *
 *
 * @param {boolean} isSentinel3: is it Sentinel-3 or not (=Sentinel-2)
 */
function getIndices(isSentinel3) {
    return isSentinel3 ? {
        natural: "[1.0*samples.B07+1.4*samples.B09-0.1*samples.B14,1.1*samples.B05+1.4*samples.B06-0.2*samples.B14,2.6*samples.B04-samples.B14*0.6]",
        chl: {
            flh: "samples.B10-1.005*(samples.B08+(samples.B11-samples.B08)*((0.681-0.665)/(0.708-0.665)))",
            rlh: "samples.B11-samples.B10-(samples.B18-samples.B10*((0.70875-0.68125)*1000.0))/((0.885-0.68125)*1000.0)",
            mci: "samples.B11-((0.75375-0.70875)/(0.75375-0.68125))*samples.B10-(1.0-(0.75375-0.70875)/(0.75375-0.68125))*samples.B12"
        },
        tss: {
            b07: "samples.B07",
            b11: "samples.B11"
        },
        watermask: {
            ndwi: "(samples.B06-samples.B17)/(samples.B06+samples.B17)"
        }
    } : {
        natural: "[2.5*samples.B04,2.5*samples.B03,2.5*samples.B02]",
        chl: {
            rlh: "samples.B05-samples.B04-(samples.B07-samples.B04*((0.705-0.665)*1000.0))/((0.783-0.665)*1000.0)",
            mci: "samples.B05-((0.74-0.705)/(0.74-0.665))*samples.B04-(1.0-(0.74-0.705)/(0.74-0.665))*samples.B06"
        },
        tss: {
            b05: "samples.B05"
        },
        watermask: {
            ndwi: "(samples.B03-samples.B08)/(samples.B03+samples.B08)"
        }
    };
}

/**
 * Blends between two layers
 * Uses https://pierre-markuse.net/2019/03/26/sentinel-3-data-visualization-in-eo-browser-using-a-custom-script/
 *
 * @param {Object} layer1: first (top) layer
 * @param {Object} layer2: second (bottom) layer
 * @param {number} opacity1: first layer opacity
 * @param {number} opacity2: second layer opacity
 */
function blend(layer1, layer2, opacity1, opacity2) {
    return layer1.map(function (num, index) {
        return (num / 100) * opacity1 + (layer2[index] / 100) * opacity2;
    });
}

/**
 * Returns an opacity (alpha) value between 0 and 100 for a given index based on min and max values
 *
 * @param {Object} index: selected index
 * @param {number} min: user defined minimum value
 * @param {number} max: user defined maximum value
 */
function getAlpha(index, min, max) {
    if (min + (max - min) / 2 < index) {
        return 100;
    }
    return index <= min ?
        0 :
        index >= max ?
            1 :
            100 * ((index - min / 2) / (max - min));
}

/**
 * Returns a color palette for chlorophyll or sediment index
 *
 * @param {String} type: palette type ('chl' for chlorophyll, 'tss' for sediment)
 * @param {Object} index: user selected index
 * @param {number} min: user defined minimum value
 * @param {number} max: user defined maximum value
 * @param {boolean} isSentinel3Flh: is it Sentinel3 && is 'flh' is the user selected chlorophyll index (only for 'chl' type)
 */
function getColors(type, index, min, max, isSentinel3Flh) {
    let colors, palette;
    switch (type) {
        case 'chl':
            palette = [
                [0.0034, 0.0142, 0.163], // #01042A (almost black blue)
                [0, 0.416, 0.306], // #006A4E (bangladesh green)
                [0.486, 0.98, 0], //#7CFA00 (dark saturated chartreuse)
                [0.9465, 0.8431, 0.1048], //#F1D71B (light washed yellow)
                [1, 0, 0] // #FF0000 (red)
            ];
            // In case of Sentinel-3 && 'flh' the palette has to be reversed and min and max values also needed to be adjusted
            if (isSentinel3Flh) {
                palette = palette.reverse();
                min = min * 10;
                max = max / 10;
            }
            colors = colorBlend(
                index,
                [min, min + (max - min) / 3, (min + max) / 2, max - (max - min) / 3, max],
                palette
            );
            break;
        case 'tss':
            palette = [
                [0.961, 0.871, 0.702], // #F5DEB3 (wheat)
                [0.396, 0.263, 0.129] // #654321 (dark brown)
            ];
            colors = colorBlend(
                index,
                [min, max],
                palette
            );
            break;
        default:
            break;
    }
    return colors;
}

/**
 * Returns true if the pixel covers area of pure water without any cloud, shadow or snow, otherwise returns false
 * Based on the algorithm by Hollstein et al. at https://custom-scripts.sentinel-hub.com/custom-scripts/sentinel-2/hollstein/
 *
 * @param {boolean} isSentinel3: is it Sentinel-3 or not (=Sentinel-2)
 */
function isPureWater(isSentinel3, samples) {
    return isSentinel3 ?
        samples.B06 < 0.319 && samples.B17 < 0.166 && samples.B06 - samples.B16 >= 0.027 && samples.B20 - samples.B21 < 0.021 :
        samples.B03 < 0.319 && samples.B8A < 0.166 && samples.B03 - samples.B07 >= 0.027 && samples.B09 - samples.B11 < 0.021;
}

/**
 * Returns whether the pixel is marked as cloud
 * Based on the algorithm by the Braaten-Cohen-Yang cloud detector at https://github.com/sentinel-hub/custom-scripts/tree/master/sentinel-2/cby_cloud_detection
 *
 * @param {number} limit: user defined cloud limit
 * @param {boolean} isSentinel3: is it Sentinel-3 or not (=Sentinel-2)
 */
function isCloud(limit, isSentinel3, samples) {
    const bRatio = isSentinel3 ? (samples.B04 - 0.175) / (0.39 - 0.175) : (samples.B02 - 0.175) / (0.39 - 0.175);
    return bRatio > 1 || (bRatio > 0 && (samples.B04 - samples.B06) / (samples.B04 + samples.B06) > limit);
}

/**
 * Returns an evaluated code of a string
 * This was needed because functions with eval() won't make it through minification
 *
 * @param {String} s: input string to evaluate
 */
function getEval(s, samples) {
    return eval(s);
}

/**
 * Returns whether the pixel is marked as water (not land, cloud or snow) based on the array of indices given by the user
 *
 * @param {Object} params: user defined parameters
 * @param {Array<String>} indices: array of water indices given by the user. Possible values: "ndwi", "hol", "bcy" and any of their combinations.
 * @param {boolean} isSentinel3: is it Sentinel-3 or not (=Sentinel-2)
 */
function isWater(availableWatermaskIndices, selectedWatermaskIndices, waterMax, cloudMax, isSentinel3, samples) {
    if (selectedWatermaskIndices.length === 0) {
        return true;
    } else {
        let isItWater = true;
        for (let i = 0; i < selectedWatermaskIndices.length; i++) {
            const wm = selectedWatermaskIndices[i];
            if (wm == "ndwi" && getEval(availableWatermaskIndices.ndwi, samples) < waterMax) {
                isItWater = false;
                break;
            } else if (wm == "hol" && !isPureWater(isSentinel3, samples)) {
                isItWater = false;
                break;
            } else if (wm == "bcy" && isCloud(cloudMax, isSentinel3, samples)) {
                isItWater = false;
                break;
            }
        }
        return isItWater;
    }
}

/**
 * Returns background layer
 *
 * @param {String | Array<number>} background: predefined or custom background color
 * @param {Array<numer>} naturalIndex: natural color index
 * @param {number} opacity: background opacity from 0 to 1 (floating value)
 */
function getBackground(background, naturalIndex, opacity, samples) {
    let backgroundLayer;
    let isRgb = false;
    const alpha = parseInt(opacity * 100);
    // Default should be the natural layer
    if (background === 'default' || background === 'natural') {
        backgroundLayer = getEval(naturalIndex, samples);
        isRgb = true;
    } else if (background === 'black') {
        // Black background
        backgroundLayer = [0, 0, 0];
    } else if (background === 'white') {
        // White background
        backgroundLayer = [1, 1, 1];
    } else {
        // Custom rgb colors array (eg. [255, 255, 0])
        backgroundLayer = getStaticColor(background);
    }
    // Only calculate alpha is really needed
    return isRgb || opacity === 1 ? backgroundLayer : blend(backgroundLayer, getEval(naturalIndex, samples), alpha, 100 - alpha);
}

/**
 * Returns foreground layer
 *
 * @param {String | Array<number>} foreground: predefined or custom foreground color
 * @param {*} backgroundLayer: background layer (for blending)
 * @param {*} naturalIndex: natural layer
 * @param {*} opacity: foreground opacity from 0 to 1 (floating value)
 */
function getForeground(foreground, backgroundLayer, naturalIndex, opacity, samples) {
    let layer;
    const alpha = parseInt(opacity * 100);
    if (foreground === 'natural') {
        layer = getEval(naturalIndex, samples);
    } else {
        layer = getStaticColor(foreground);
    }
    return opacity === 1 ? layer : blend(layer, backgroundLayer, alpha, 100 - alpha);
}

/**
 * Transforms RGB 0-255 colors to 0.0-1.0
 *
 * @param {[number, number, number]} colorArray: 3-element array of RGB colors (0-255)
 */
function getStaticColor(colorArray) {
    return [colorArray[0] / 255, colorArray[1] / 255, colorArray[2] / 255];
}

/**
 * Runs the main calculation and returns the value for each pixel
 *
 * @param {Object} params: user defined parameters
 */
function getValue(params, samples) {
    let chlIndex, chlLayer, tssIndex, tssLayer, tssAlpha;
    const chl = params.chlIndex;
    const tss = params.tssIndex;
    const background = params.background;
    const foreground = params.foreground;
    const foregroundOpacity = params.foregroundOpacity;
    // Get the indices that could potentially be used
    const indices = getIndices(isSentinel3);
    // Define background layer
    const backgroundLayer = getBackground(background, indices.natural, params.backgroundOpacity, samples);
    // Decide whether the pixel can be assumed as water
    // Return background layer if it is not water
    const waterMask = !isWater(indices.watermask, params.watermaskIndices, params.waterMax, params.cloudMax, isSentinel3, samples)
    const dummyOut = Array(nOut).fill(NaN);
    if (waterMask) {
        return {
            default: backgroundLayer,
            index: dummyOut,
            eobrowserStats: dummyOut.concat(0),
            dataMask: [0]
        };
    }
    // Return a static color if set so with opacity
    if (foreground !== 'default') {
        return {
            default: getForeground(foreground, backgroundLayer, indices.natural, foregroundOpacity, samples),
            index: dummyOut,
            eobrowserStats: dummyOut.concat(0),
            dataMask: [0]
        };
    }
    let value;
    let outIndices = [];
    // Define the chlorophyll layer if needed
    if (chl !== null) {
        // In case of 'default' set proper algorighm
        const alg = chl === 'default' ? (isSentinel3 ? 'flh' : 'mci') : chl;
        chlIndex = getEval(indices.chl[alg], samples);
        outIndices.push(chlIndex);
        chlLayer = getColors('chl', chlIndex, params.chlMin, params.chlMax, (isSentinel3 && alg === 'flh'));
    }
    // Define the sediment layer if needed
    if (tss !== null) {
        // In case of 'default' set proper algorighm
        const alg = tss === 'default' ? (isSentinel3 ? 'b11' : 'b05') : tss;
        tssIndex = getEval(indices.tss[alg], samples);
        outIndices.push(tssIndex);
        tssLayer = getColors('tss', tssIndex, params.tssMin, params.tssMax);
        tssAlpha = getAlpha(tssIndex, params.tssMin, params.tssMax);
    }
    // Calculate output value
    if (chl !== null && tss !== null) {
        // Blend layers if both chlorophyll and sediment layers are requested
        // Put sediment layer on top of chlorophyll layer with alpha
        value = blend(tssLayer, chlLayer, tssAlpha, 100 - tssAlpha);
    } else if (chl !== null && tss === null) {
        // Chlorophyll layer only if sediment layer is null
        value = chlLayer;
    } else if (tss !== null && chl === null) {
        // Sediment layer only if chlorophyll layer is null
        // Put sediment layer on top of natural layer with alpha
        value = blend(tssLayer, backgroundLayer, tssAlpha, 100 - tssAlpha);
    } else {
        // Natural color layer if both chlorophyll and sediment layers are null (which does not make much sense)
        value = backgroundLayer;
    }
    // Return foreground (with opacity if needed on top of background)
    const foregroundAlpha = parseInt(foregroundOpacity * 100);
    const imgVals = foregroundOpacity === 1 ? value : blend(value, backgroundLayer, foregroundAlpha, 100 - foregroundAlpha);
    return {
        default: imgVals,
        index: outIndices,
        eobrowserStats: outIndices.concat(isCloud(params.cloudMax, isSentinel3, samples)),
        dataMask: [samples.dataMask]
    };
}

function evaluatePixel(samples) {
    return getValue(PARAMS, samples);
}
