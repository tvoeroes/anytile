# Anytile

## Link to the Anytile Viewer

[https://tvoeroes.github.io/anytile](https://tvoeroes.github.io/anytile)

## Manual

The viewer supports viewing **XYZ** tiled images and **3D Tiles**. The supported
url placeholders for **XYZ** tiles are `{x}`, `{y}`, `{z}` and `{q}`. Any
placeholder in the url that is not a built-in placeholder such as `{name}`
becomes a custom parameter with a text input in the menu. **3D Tiles** and
**GeoJSON** are rendered with the [CesiumJS](https://github.com/CesiumGS/cesium)
library. The **3D Tiles** mode is selected automatically when the url points to
a non-GeoJSON `.json` file, and **GeoJSON** when it points to a `.geojson` file
or a `.json` file that has been recognized as a GeoJSON file. You can also drag
local GeoJSON files in to the viewer.

## How to Package

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Package the project:
   ```bash
   npm run build
   ```
   The output is written to the `dist/` folder.

## How to Develop

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open the local URL printed in the terminal (e.g. `http://localhost:1234`) in
   your browser.

## License

To be decided.
