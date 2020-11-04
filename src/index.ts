import * as PIXI from 'pixi.js'
import {CubesSimulator} from './cubes-simulator'

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
	let simulator = new CubesSimulator(app);
});

declare global {
	interface Array<T> {
		min(): number;
		max(): number;
	}
	function printStep(text: string): void;
	function printMiniStep(text: string): void;
}

Array.prototype.min = function<T extends number>(): number {
	let minimum = Infinity;
	for (let i = 0; i < this.length; i++) {
		minimum = Math.min(minimum, this[i]);
	}
	return minimum;
}

Array.prototype.max = function<T extends number>(): number {
	let maximum = -Infinity;
	for (let i = 0; i < this.length; i++) {
		maximum = Math.max(maximum, this[i]);
	}
	return maximum;
}

