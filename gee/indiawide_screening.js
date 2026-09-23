// ============================================================
// MOIL SIH 2026 - INDIA-WIDE REMOTE SENSING SCREENING
// STABLE TILE-BASED VERSION
//
// Purpose:
//   Generate India-wide Sentinel-2 + Sentinel-1 + SRTM
//   screening features in manageable geographic tiles.
//
// IMPORTANT:
//   This is a SCREENING DATASET.
//   It is NOT the 117-feature Balaghat XGBoost prediction yet.
// ============================================================


// ============================================================
// 1. INDIA BOUNDING BOX
// ============================================================

var INDIA = ee.Geometry.Rectangle(
  [68.0, 6.0, 97.0, 37.0],
  null,
  false
);


// ============================================================
// 2. DATE RANGE
// ============================================================

// Use a shorter dry-season window.
// This substantially reduces processing compared with
// a full-year national composite.

var START = '2024-01-01';
var END   = '2024-05-01';


// ============================================================
// 3. TILE DEFINITIONS
// ============================================================
//
// India is divided into 8 manageable tiles.
//
// Each tile is processed separately.
// DO NOT combine them into one huge operation.
//

var tiles = [

  // West
  ee.Geometry.Rectangle(
    [68.0, 6.0, 75.25, 21.5],
    null,
    false
  ),

  // Central-West
  ee.Geometry.Rectangle(
    [75.25, 6.0, 82.5, 21.5],
    null,
    false
  ),

  // Central-East
  ee.Geometry.Rectangle(
    [82.5, 6.0, 89.75, 21.5],
    null,
    false
  ),

  // East
  ee.Geometry.Rectangle(
    [89.75, 6.0, 97.0, 21.5],
    null,
    false
  ),

  // North-West
  ee.Geometry.Rectangle(
    [68.0, 21.5, 75.25, 37.0],
    null,
    false
  ),

  // North-Central
  ee.Geometry.Rectangle(
    [75.25, 21.5, 82.5, 37.0],
    null,
    false
  ),

  // North-East-Central
  ee.Geometry.Rectangle(
    [82.5, 21.5, 89.75, 37.0],
    null,
    false
  ),

  // North-East
  ee.Geometry.Rectangle(
    [89.75, 21.5, 97.0, 37.0],
    null,
    false
  )
];


// ============================================================
// 4. FUNCTION TO BUILD FEATURES FOR ONE TILE
// ============================================================

function buildTile(tile) {

  // ----------------------------------------------------------
  // SENTINEL-2
  // ----------------------------------------------------------

  var s2 = ee.ImageCollection(
    'COPERNICUS/S2_SR_HARMONIZED'
  )
    .filterBounds(tile)
    .filterDate(START, END)
    .filter(
      ee.Filter.lt(
        'CLOUDY_PIXEL_PERCENTAGE',
        40
      )
    )
    .select([
      'B2',
      'B3',
      'B4',
      'B5',
      'B6',
      'B7',
      'B8',
      'B8A',
      'B11',
      'B12'
    ]);

  var s2Image = s2
    .median()
    .divide(10000)
    .clip(tile);


  // ----------------------------------------------------------
  // SENTINEL-2 SPECTRAL FEATURES
  // ----------------------------------------------------------

  var NDVI =
    s2Image
      .normalizedDifference(['B8', 'B4'])
      .rename('NDVI');

  var NDMI =
    s2Image
      .normalizedDifference(['B8', 'B11'])
      .rename('NDMI');

  var NBR =
    s2Image
      .normalizedDifference(['B8', 'B12'])
      .rename('NBR');

  var NDRE =
    s2Image
      .normalizedDifference(['B8A', 'B5'])
      .rename('NDRE');

  var NIR_Red_Ratio =
    s2Image
      .select('B8')
      .divide(
        s2Image.select('B4').add(0.0001)
      )
      .rename('NIR_Red_Ratio');

  var Red_Green_Ratio =
    s2Image
      .select('B4')
      .divide(
        s2Image.select('B3').add(0.0001)
      )
      .rename('Red_Green_Ratio');

  var SWIR_NIR_Ratio =
    s2Image
      .select('B11')
      .divide(
        s2Image.select('B8').add(0.0001)
      )
      .rename('SWIR_NIR_Ratio');

  var SWIR_Ratio =
    s2Image
      .select('B12')
      .divide(
        s2Image.select('B11').add(0.0001)
      )
      .rename('SWIR_Ratio');

  var Iron_Oxide_Index =
    s2Image
      .select('B4')
      .divide(
        s2Image.select('B2').add(0.0001)
      )
      .rename('Iron_Oxide_Index');

  var Clay_Alteration_Index =
    s2Image
      .select('B11')
      .divide(
        s2Image.select('B12').add(0.0001)
      )
      .rename('Clay_Alteration_Index');

  var Ferrous_Index =
    s2Image
      .select('B11')
      .divide(
        s2Image.select('B8').add(0.0001)
      )
      .rename('Ferrous_Index');

  var SWIR_Red_Ratio =
    s2Image
      .select('B11')
      .divide(
        s2Image.select('B4').add(0.0001)
      )
      .rename('SWIR_Red_Ratio');

  var SWIR_Green_Ratio =
    s2Image
      .select('B11')
      .divide(
        s2Image.select('B3').add(0.0001)
      )
      .rename('SWIR_Green_Ratio');

  var NIR_SWIR2_Ratio =
    s2Image
      .select('B8')
      .divide(
        s2Image.select('B12').add(0.0001)
      )
      .rename('NIR_SWIR2_Ratio');

  var B11_B12_NormDiff =
    s2Image
      .normalizedDifference(['B11', 'B12'])
      .rename('B11_B12_NormDiff');

  var B8_B12_NormDiff =
    s2Image
      .normalizedDifference(['B8', 'B12'])
      .rename('B8_B12_NormDiff');

  var B4_B2_NormDiff =
    s2Image
      .normalizedDifference(['B4', 'B2'])
      .rename('B4_B2_NormDiff');


  // ----------------------------------------------------------
  // SENTINEL-1
  // ----------------------------------------------------------

  var s1 = ee.ImageCollection(
    'COPERNICUS/S1_GRD'
  )
    .filterBounds(tile)
    .filterDate(START, END)
    .filter(
      ee.Filter.eq(
        'instrumentMode',
        'IW'
      )
    )
    .filter(
      ee.Filter.listContains(
        'transmitterReceiverPolarisation',
        'VV'
      )
    )
    .filter(
      ee.Filter.listContains(
        'transmitterReceiverPolarisation',
        'VH'
      )
    )
    .select([
      'VV',
      'VH'
    ]);

  var s1Image =
    s1.median().clip(tile);

  var VV =
    s1Image
      .select('VV')
      .rename('VV');

  var VH =
    s1Image
      .select('VH')
      .rename('VH');

  var VV_VH_Difference =
    VV.subtract(VH)
      .rename('VV_VH_Difference');


  // ----------------------------------------------------------
  // SRTM TERRAIN
  // ----------------------------------------------------------

  var srtm =
    ee.Image('USGS/SRTMGL1_003')
      .clip(tile);

  var Elevation =
    srtm
      .select('elevation')
      .rename('Elevation');

  var terrain =
    ee.Terrain.products(srtm);

  var Slope =
    terrain
      .select('slope')
      .rename('Slope');

  var Aspect =
    terrain
      .select('aspect')
      .rename('Aspect');

  var radians =
    Aspect.multiply(
      Math.PI / 180
    );

  var Aspect_Sin =
    radians.sin()
      .rename('Aspect_Sin');

  var Aspect_Cos =
    radians.cos()
      .rename('Aspect_Cos');


  // ----------------------------------------------------------
  // COMBINE ALL FEATURES
  // ----------------------------------------------------------

  var features =
    s2Image

      .addBands(NDVI)
      .addBands(NDMI)
      .addBands(NBR)
      .addBands(NDRE)

      .addBands(NIR_Red_Ratio)
      .addBands(Red_Green_Ratio)
      .addBands(SWIR_NIR_Ratio)
      .addBands(SWIR_Ratio)

      .addBands(Iron_Oxide_Index)
      .addBands(Clay_Alteration_Index)
      .addBands(Ferrous_Index)

      .addBands(SWIR_Red_Ratio)
      .addBands(SWIR_Green_Ratio)
      .addBands(NIR_SWIR2_Ratio)

      .addBands(B11_B12_NormDiff)
      .addBands(B8_B12_NormDiff)
      .addBands(B4_B2_NormDiff)

      .addBands(VV)
      .addBands(VH)
      .addBands(VV_VH_Difference)

      .addBands(Elevation)
      .addBands(Slope)
      .addBands(Aspect)

      .addBands(Aspect_Sin)
      .addBands(Aspect_Cos)

      .toFloat();

  return features;
}


// ============================================================
// 5. CREATE EACH TILE
// ============================================================

var tile1 = buildTile(tiles[0]);
var tile2 = buildTile(tiles[1]);
var tile3 = buildTile(tiles[2]);
var tile4 = buildTile(tiles[3]);

var tile5 = buildTile(tiles[4]);
var tile6 = buildTile(tiles[5]);
var tile7 = buildTile(tiles[6]);
var tile8 = buildTile(tiles[7]);


// ============================================================
// 6. SAMPLE + EXPORT FUNCTION
// ============================================================
//
// We sample directly at 10 km.
// This gives a coarse national screening grid.
//
// 10,000 pixels per tile × 8 tiles
// = approximately 80,000 samples total.
//

function exportTile(
  image,
  geometry,
  tileNumber
) {

  var samples =
    image.sample({
      region: geometry,
      scale: 10000,
      numPixels: 10000,
      seed: 42 + tileNumber,
      geometries: true,
      tileScale: 4
    });


  var samplesWithCoordinates =
    samples.map(
      function(feature) {

        var coords =
          feature.geometry()
            .coordinates();

        return feature.set({
          longitude: coords.get(0),
          latitude: coords.get(1),
          tile: tileNumber
        });

      }
    );


  Export.table.toDrive({
    collection:
      samplesWithCoordinates,

    description:
      'MOIL_India_2024_Tile_' +
      tileNumber,

    folder:
      'MOIL_SIH_2026',

    fileNamePrefix:
      'moil_indiawide_2024_tile_' +
      tileNumber,

    fileFormat:
      'CSV'
  });
}


// ============================================================
// 7. EXPORT 8 TILES
// ============================================================

exportTile(tile1, tiles[0], 1);
exportTile(tile2, tiles[1], 2);
exportTile(tile3, tiles[2], 3);
exportTile(tile4, tiles[3], 4);

exportTile(tile5, tiles[4], 5);
exportTile(tile6, tiles[5], 6);
exportTile(tile7, tiles[6], 7);
exportTile(tile8, tiles[7], 8);


// ============================================================
// 8. MAP DISPLAY
// ============================================================

Map.centerObject(INDIA, 5);

Map.addLayer(
  tile1.select('NDVI'),
  {
    min: 0,
    max: 1
  },
  'Tile 1 NDVI',
  false
);

Map.addLayer(
  tile1.select('SWIR_Ratio'),
  {
    min: 0,
    max: 2
  },
  'Tile 1 SWIR Ratio',
  false
);

Map.addLayer(
  tile1.select('Elevation'),
  {
    min: 0,
    max: 1000
  },
  'Tile 1 Elevation',
  false
);

print(
  'MOIL India-wide screening script loaded successfully.'
);

print(
  '8 export tasks have been created.'
);

print(
  'Go to the Tasks tab and click RUN for each task.'
);