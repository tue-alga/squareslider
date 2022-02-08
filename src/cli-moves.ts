import {World} from './world';
import {ComponentStatus} from './cube';
import {GatherAlgorithm} from './algorithms/gather';
import {CompactSortedAlgorithm} from './algorithms/compact-sorted';

const fs = require('fs');

(global as any).printStep = function (text: string): void {
	console.log('>>> ' + text);
};

(global as any).printMiniStep = function (text: string): void {
	console.log(text);
};

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

if (process.argv.length !== 3) {
	throw "One argument required (input file name)";
}

const configurationFile = process.argv[2];
const configurationJson = fs.readFileSync(configurationFile, 'utf-8');

let world = new World();
world.deserialize(configurationJson);
let bounds = world.bounds();
printWorld(world, bounds);

let step = 0;
let moves: [[number, number], [number, number]][] = [];

let algorithm = new GatherAlgorithm(world).execute();
while (true) {
	step++;
	try {
		world.nextStep(algorithm, step);
	} catch (e) {
		console.error(`\x1b[31m\x1b[1mError in algorithm code:\x1b[0m`);
		printWorld(world, bounds);
		console.log(e);
		process.exit(1);
	}
	if (world.currentMove) {
		moves.push([world.currentMove.sourcePosition(), world.currentMove.targetPosition()]);
		console.log(`Time step ${step}. Move: ${world.currentMove.toString()}`);
	} else {
		console.log(`Time step ${step}. No move left.`);
		break;
	}
}
step--;
let gatherSteps = step;

printWorld(world, bounds);

algorithm = new CompactSortedAlgorithm(world).execute();
while (true) {
	step++;
	world.nextStep(algorithm, step);
	if (world.currentMove) {
		// @ts-ignore
		moves.push([world.currentMove.sourcePosition(), world.currentMove.targetPosition()]);
		// @ts-ignore
		console.log(`Time step ${step}. Move: ${world.currentMove.toString()}`);
	} else {
		console.log(`Time step ${step}. No move left.`);
		break;
	}
}
step--;
let compactSteps = step - gatherSteps;

printWorld(world, bounds);

console.log(`Algorithm execution took ${step} moves ` +
		`(of which ${gatherSteps} gathering, ${step - gatherSteps} compaction)`);

fs.writeFileSync('out.json', JSON.stringify({'movepaths': moves}));


function printWorld(world: World, bounds: [number, number, number, number]) {
	const [minX, minY, maxX, maxY] = bounds;
	
	console.log('┌' + '─'.repeat(2 * (maxX - minX) + 3) + '┐');
	for (let y = maxY; y >= minY; y--) {
		let line = "│ ";
		for (let x = minX; x <= maxX; x++) {
			if (world.hasCube([x, y])) {
				const cube = world.getCube([x, y])!;
				switch (cube.componentStatus) {
					case ComponentStatus.CHUNK_CUT:
						line += '\x1b[34m□\x1b[0m ';
						break;
					case ComponentStatus.CHUNK_STABLE:
						line += '\x1b[34m■\x1b[0m ';
						break;
					case ComponentStatus.CONNECTOR:
						line += '\x1b[34m×\x1b[0m ';
						break;
					case ComponentStatus.LINK_CUT:
						line += '\x1b[31m□\x1b[0m ';
						break;
					case ComponentStatus.LINK_STABLE:
						line += '\x1b[31m■\x1b[0m ';
						break;
				}
			} else {
				line += '  ';
			}
		}
		line += "│";
		console.log(line);
	}
	console.log('└' + '─'.repeat(2 * (maxX - minX) + 3) + '┘');
	//console.log(`(${world.cubes.length} cubes)`);
}

