const serveStatic = require("serve-static")

module.exports = function (app)
{
	for (const folder of ["Workers", "ThirdParty", "Assets", "Widgets"])
		app.use(`/cesium/${folder}`, serveStatic(`node_modules/cesium/Build/Cesium/${folder}`))
}
