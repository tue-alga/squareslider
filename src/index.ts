import * as PIXI from 'pixi.js'

import { SquaresSimulator } from './squares-simulator'
import { PhaseLabel } from './ui';

const container = document.getElementById('squares-simulator-container')!;
const canvas = <HTMLCanvasElement>document.getElementById('squares-simulator-canvas');
let app = new PIXI.Application({
	antialias: true,
	backgroundColor: 0xffffff,
	autoDensity: true,
	view: canvas,
	resizeTo: container
});
app.renderer.resize(container.offsetWidth, container.offsetHeight);

// set up the interaction manager such that it fires mousemove events only
// when hovering over an object (why is this not default?)
app.renderer.plugins.interaction.moveWhenInside = true;

PIXI.Loader.shared.add([
	'icons/play.png',
	'icons/step.png',
	'icons/pause.png',
	'icons/reset.png',
	'icons/pan.png',
	'icons/select.png',
	'icons/add-square.png',
	'icons/color.png',
	'icons/delete.png',
	'icons/save.png',
	'icons/help.png',
	'icons/slower.png',
	'icons/faster.png',
	'icons/show-connectivity.png'
]).load(() => {
	let simulator = new SquaresSimulator(app);
});

declare global {
	interface Array<T> {
		min(): number;
		max(): number;
	}
	function printStep(text: string): void;
	function printMiniStep(text: string): void;
	var phaseLabel: PhaseLabel | null;
}

Array.prototype.min = function <T extends number>(): number {
	let minimum = Infinity;
	for (let i = 0; i < this.length; i++) {
		minimum = Math.min(minimum, this[i]);
	}
	return minimum;
}

Array.prototype.max = function <T extends number>(): number {
	let maximum = -Infinity;
	for (let i = 0; i < this.length; i++) {
		maximum = Math.max(maximum, this[i]);
	}
	return maximum;
}
