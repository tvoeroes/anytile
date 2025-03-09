const shell = require('shelljs')

for (const folder of ["Workers", "ThirdParty", "Assets", "Widgets"])
{
	shell.mkdir("-p", `./dist/cesium/${folder}`) // seems to be buggy without mkdir it on windows
	shell.cp("-R", `./node_modules/cesium/Build/Cesium/${folder}/`, `./dist/cesium/`)
}