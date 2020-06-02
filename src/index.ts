import * as PIXI from 'pixi.js'
import {BBCS} from './bbcs'

let app = new PIXI.Application({
	antialias: true,
	backgroundColor: 0xfafafa,
	autoDensity: true
});
app.renderer.view.style.position = "absolute";
app.renderer.view.style.display = "block";
app.renderer.resize(window.innerWidth, window.innerHeight);

// set up the interaction manager such that it fires mousemove events only
// when hovering over an object (why is this not default?)
app.renderer.plugins.interaction.moveWhenInside = true;

window.addEventListener('resize', (event: UIEvent) => {
	app.renderer.resize(window.innerWidth, window.innerHeight);
});
const child = document.body.firstChild;
if (child) {
	document.body.insertBefore(app.view, child);
}

PIXI.Loader.shared.add([
	'icons/play.png',
	'icons/step.png',
	'icons/pause.png',
	'icons/reset.png',
	'icons/select.png',
	'icons/add-ball.png',
	'icons/add-wall.png',
	'icons/rotate-left.png',
	'icons/rotate-right.png',
	'icons/color.png',
	'icons/delete.png',
	'icons/save.png',
	'icons/load.png'
]).load(() => {
	let bbcs = new BBCS(app);
});

