import * as PIXI from 'pixi.js';
import {Viewport} from 'pixi-viewport';

import {Cube, Color, ComponentStatus} from './cube';

type WorldCell = {
	cube: Cube | null;
};

enum MoveDirection {
	N = "N",
	E = "E",
	S = "S",
	W = "W",
	NW = "NW",
	NE = "NE",
	EN = "EN",
	ES = "ES",
	SE = "SE",
	SW = "SW",
	WS = "WS",
	WN = "WN"
}

/**
 * Representation of a single cube move (either slide or corner).
 */
class Move {
	constructor(public world: World, public position: [number, number], public direction: MoveDirection) {
	}

	/**
	 * Returns the coordinate of the cell we're moving from.
	 */
	sourcePosition(): [number, number] {
		return this.position;
	}

	private static targetPositionFromFields(position: [number, number], direction: string): [number, number] {
		let [x, y] = [...position];
		for (let i = 0; i < direction.length; i++) {
			switch (direction[i]) {
				case "N":
					y++;
					break;
				case "S":
					y--;
					break;
				case "E":
					x++;
					break;
				case "W":
					x--;
					break;
			}
		}
		return [x, y];
	}

	/**
	 * Returns the coordinate of the cell we're moving towards.
	 */
	targetPosition(): [number, number] {
		return Move.targetPositionFromFields(this.position, this.direction);
	}

	/**
	 * Checks if this move is valid, but ignores the connectivity requirement
	 * (i.e., still returns true if this move disconnects the configuration
	 * but otherwise is valid).
	 *
	 * This avoids the need to do a BFS to check connectivity.
	 */
	isValidIgnoreConnectivity(): boolean {
		if (this.world.getCube(this.targetPosition())) {
			return false;
		}

		let has = this.world.neighbors(this.position);

		switch (this.direction) {
			case "N":
				return (has['W'] && has['NW']) || (has['E'] && has['NE']);
			case "E":
				return (has['N'] && has['NE']) || (has['S'] && has['SE']);
			case "S":
				return (has['W'] && has['SW']) || (has['E'] && has['SE']);
			case "W":
				return (has['N'] && has['NW']) || (has['S'] && has['SW']);

			default:
				// for corner moves, need to ensure that there is no cube in
				// the first direction (which would be in our way) and there
				// is a cube in the second direction (that we can pivot along)
				return !has[this.direction[0]] && has[this.direction[1]];
		}
	}

	/**
	 * Checks if this move is valid.
	 */
	isValid(): boolean {
		if (!this.isValidIgnoreConnectivity()) {
			return false;
		}
		if (!this.world.isConnected(this.position)) {
			return false;
		}
		return true;
	}
	
	/**
	 * Computes coordinates of a cube executing this move at the given time
	 * between 0 and 1.
	 */
	interpolate(time: number): [number, number] {
		time = -2 * time * time * time + 3 * time * time;

		let x: number, y: number;
		const [x1, y1] = this.sourcePosition();
		const [x2, y2] = this.targetPosition();
		if (this.direction.length === 2) {
			const [xm, ym] = Move.targetPositionFromFields(this.position, this.direction[0]);
			if (time < 0.5) {
				x = x1 + (xm - x1) * 2 * time;
				y = y1 + (ym - y1) * 2 * time;
			} else {
				x = xm + (x2 - xm) * (2 * time - 1);
				y = ym + (y2 - ym) * (2 * time - 1);
			}
		} else {
			x = x1 + (x2 - x1) * time;
			y = y1 + (y2 - y1) * time;
		}

		return [x, y];
	}

	execute(): void {
		this.world.moveCube(this.position, this.targetPosition());
	}

	toString(): string {
		const from = this.position;
		const to = this.targetPosition();
		return `(${from[0]}, ${from[1]}) \u2192 (${to[0]}, ${to[1]})`;
	}
}

/**
 * Collection of cubes on the grid.
 */
class World {

	world: WorldCell[][] = [];

	viewport = new Viewport();
	pixi = new PIXI.Container();
	backgroundPixi = new PIXI.Container();
	gridPixi = new PIXI.Container();
	grid: PIXI.Mesh;

	cubes: Cube[] = [];

	currentMove: Move | null = null;

	/**
	 * Creates the world and initializes its PIXI elements (viewport and grid).
	 */
	constructor() {
		this.viewport.addChild(this.gridPixi);
		this.viewport.addChild(this.backgroundPixi);

		this.backgroundPixi.filters = [new PIXI.filters.AlphaFilter(0.3)];
		this.viewport.addChild(this.pixi);

		this.viewport.drag();
		this.viewport.pinch();
		this.viewport.wheel();
		this.viewport.clampZoom({
			"minScale": 0.1,
			"maxScale": 2,
		});
		this.viewport.zoomPercent(-0.5, true);

		const gridLineShader = `
		uniform mat3 projectionMatrix;
		`;

		const gridGeometry = new PIXI.Geometry().addAttribute('aVertexPosition',
			[
				-1e6, -1e6, 1e6, -1e6, 1e6, 1e6,
				1e6, 1e6, -1e6, 1e6, -1e6, -1e6
			]);
		const gridShader = PIXI.Shader.from(`
			precision mediump float;
			attribute vec2 aVertexPosition;

			uniform mat3 translationMatrix;
			uniform mat3 projectionMatrix;

			varying vec2 uv;

			void main() {
				gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
				uv = aVertexPosition;
			}`,
			`precision mediump float;

			uniform mat3 translationMatrix;

			varying vec2 uv;

			float gridValue(float coord, float lineWidth) {
				return clamp(-abs(mod(coord - 0.0, 160.0) - 80.0) + lineWidth, 0.0, 1.0);
			}

			void main() {
				float zoom = translationMatrix[1][1];
				float width = 3.0 / sqrt(zoom);
				float base = clamp(1.1 - zoom, 0.9, 1.0);
				if ((uv.x > -50.0 && uv.x < -30.0) || (uv.y > 30.0 && uv.y < 50.0)) {
					base *= 0.6;
				}
				float xMod = gridValue(uv.x * 2.0, width);
				float yMod = gridValue(uv.y * 2.0, width);
				float gray = base + (1.0 - max(xMod, yMod)) * (1.0 - base);
				gl_FragColor = vec4(gray, gray, gray, 1.0);
			}
			`);
		this.grid = new PIXI.Mesh(gridGeometry, gridShader);
		this.gridPixi.addChild(this.grid);
	}

	private getColumn(x: number): WorldCell[] {
		if (!this.world[x]) {
			this.world[x] = [];
		}
		return this.world[x];
	}

	private getCell([x, y]: [number, number]): WorldCell {
		let column = this.getColumn(x);
		if (!column[y]) {
			column[y] = {
				cube: null
			};
		}
		return column[y];
	}

	/**
	 * Returns the cube at the given location, or null if that cell is empty.
	 */
	getCube(p: [number, number]): Cube | null {
		return this.getCell(p).cube;
	}

	/**
	 * Checks if a cube exists at the given location.
	 */
	hasCube(p: [number, number]): boolean {
		return !!this.getCube(p);
	}

	/**
	 * Adds a new cube of the given color at the given location; throws if a
	 * cube already exists at that location.
	 */
	addCube(p: [number, number], color: Color): Cube {
		if (this.getCube(p)) {
			throw `Tried to insert cube on top of another cube ` +
					`at (${p[0]}, ${p[1]})`;
		}
		const cube = new Cube(this, p, color);
		this.getCell(p).cube = cube;
		this.cubes.push(cube);
		this.pixi.addChild(cube.pixi);
		this.backgroundPixi.addChild(cube.backgroundPixi);
		this.markComponents();
		return cube;
	}

	/**
	 * Moves the cube from the given source location to the given target
	 * location. Throws if no cube exists at the source or if a cube already
	 * exists at the target.
	 */
	moveCube(from: [number, number], to: [number, number]): void {
		const cube = this.getCube(from);
		if (!cube) {
			throw `Tried to move non-existing cube at ` +
					`at (${from[0]}, ${from[1]})`;
		}

		if (this.getCube(to)) {
			throw `Tried to move cube on top of another cube ` +
					`at (${to[0]}, ${to[1]})`;
		}

		this.getCell(from).cube = null;
		cube.p = [to[0], to[1]];
		cube.updatePosition(0, 0);
		this.getCell(to).cube = cube;
		this.markComponents();
	}

	/**
	 * Removes the cube at the given location; throws if no cube exists there.
	 */
	removeCube(p: [number, number]): void {
		const cube = this.getCube(p);
		if (!cube) {
			throw `Tried to remove non-existing cube ` +
					`at (${p[0]}, ${p[1]})`;
		}
		this.pixi.removeChild(cube.pixi);
		this.backgroundPixi.removeChild(cube.backgroundPixi);
		this.cubes = this.cubes.filter((b) => b !== cube);
		this.getCell(p).cube = null;
		this.markComponents();
	}

	/**
	 * Returns an object with keys 'N', 'NE', 'E', etc. with booleans
	 * indicating if the given cell has neighboring cubes in that direction.
	 */
	neighbors(p: [number, number]): {[key: string]: boolean} {
		const [x, y] = p;
		let has: {[key: string]: boolean} = {};
		has['N'] = this.hasCube([x, y + 1]);
		has['NE'] = this.hasCube([x + 1, y + 1]);
		has['E'] = this.hasCube([x + 1, y]);
		has['SE'] = this.hasCube([x + 1, y - 1]);
		has['S'] = this.hasCube([x, y - 1]);
		has['SW'] = this.hasCube([x - 1, y - 1]);
		has['W'] = this.hasCube([x - 1, y]);
		has['NW'] = this.hasCube([x - 1, y + 1]);
		return has;
	}

	/**
	 * Given a cube, returns a list of all the moves starting at that cube that
	 * are valid.
	 *
	 * If the configuration would be disconnected without the given cube, no
	 * move is valid, so an empty array is returned.
	 */
	validMovesFrom(p: [number, number]): Move[] {
		let moves: Move[] = [];

		if (!this.isConnected(p)) {
			return [];
		}

		for (const direction of Object.keys(MoveDirection)) {
			const m = new Move(this, p, MoveDirection[<MoveDirection> direction]);
			if (m.isValidIgnoreConnectivity()) {
				// already checked connectivity before (yay, efficiency!)
				moves.push(m);
			}
		}

		return moves;
	}

	/**
	 * Executes the shortest move path between the given cubes.
	 *
	 * Throws if no move path is possible.
	 *
	 * @param from The source coordinate, containing the cube we want to move.
	 * @param to The target coordinate, which should be an empty cell.
	 */
	*shortestMovePath(from: [number, number], to: [number, number]): Generator<Move, void, undefined> {

		// do BFS over the move graph
		let seen: {[key: string]: {'seen': boolean, 'move': Move | null}} = {};
		let queue: [[number, number], Move | null][] = [[from, null]];

		while (queue.length !== 0) {
			const location = queue.shift()!;
			if (seen[location[0][0] + "," + location[0][1]]) {
				continue;
			}
			seen[location[0][0] + "," + location[0][1]] = {
				'seen': true,
				'move': location[1]
			};
			if (location[0][0] === to[0] && location[0][1] === to[1]) {
				// done!
				break;
			}

			const moves = this.validMovesFrom(location[0]); // FIXME this allows moves that use the from cube...
			const self = this;
			moves.forEach(function(move) {
				queue.push([move.targetPosition(), move]);
			});
		}

		if (!seen[to[0] + "," + to[1]]) {
			throw "No move path possible from " + from + " to " + to;
		}

		// reconstruct the path
		let path: Move[] = [];
		let c = to;
		while (c[0] !== from[0] || c[1] !== from[1]) {
			let move = seen[c[0] + "," + c[1]].move!;
			path.unshift(move);
			c = move.sourcePosition();
		}
		yield* path;
	}

	nextStep(algorithm: Generator<Move, void, undefined>, step: number): void {

		// first actually execute the current move
		if (this.currentMove) {
			this.currentMove.execute();
		}
		this.markComponents();

		// now figure out the next move
		const output = algorithm.next();
		if (output.done) {
			this.currentMove = null;
			return;
		}
		if (!output.value.isValid()) {
			throw "Invalid move detected: " + output.value.toString();
		}

		this.currentMove = output.value;
	}

	*moveToRectangle(): Generator<Move, void, undefined> {

		/*while (!this.isSiphonable()) {
			const gaps = this.gaps();
			console.log(gaps);

			const deflatables = gaps.filter(this.isDeflatable.bind(this));
			if (deflatables.length) {
				yield* this.doDeflate(deflatables[0]);
				continue;
			}
			const inflatables = gaps.filter(this.isInflatable.bind(this));
			if (inflatables.length) {
				yield* this.doInflate(inflatables[0]);
				continue;
			}

			printStep('No empty cells left, done!');
			break;
		}*/

		//while (this.isSiphonable()) {
		while (this.hasCube([0, 1]) || this.hasCube([1, 0])) {
			yield* this.doSiphonStep();
		}

		//yield* this.buildBestBridge();  // TODO
		
		//yield* this.buildBridge(this.getCube(2, 7)!, this.getCube(1, 9)!);
	}

	/**
	 * Checks if the configuration is siphonable.
	 *
	 * This is the case if it is a single monotone 2-component containing
	 * (0, 0), and not containing any gaps.
	 *
	 * TODO check for gaps
	 */
	isSiphonable(): boolean {

		// check if we contain the origin
		if (!this.hasCube([0, 0])) {
			return false;
		}
		let originId = this.cubes.indexOf(this.getCube([0, 0])!);

		// check if the boundary is all part of a 2-component
		// TODO!!!!

		// check if we don't contain gaps
		let gaps = this.gaps();
		if (gaps.length) {
			return false;
		}

		// check monotonicity by running BFS to top-right, counting the
		// number of cubes found, and checking if this is equal to total
		// number of cubes
		let seen = Array(this.cubes.length).fill(false);
		let seenCount = 0;
		let queue = [originId];

		while (queue.length !== 0) {
			const cubeId = queue.shift()!;
			if (seen[cubeId]) {
				continue;
			}
			
			const cube = this.cubes[cubeId];
			seen[cubeId] = true;
			seenCount++;

			const topRightNeighbors = [
				this.getCell([cube.p[0] + 1, cube.p[1]]),
				this.getCell([cube.p[0], cube.p[1] + 1])
			];
			const self = this;
			topRightNeighbors.forEach(function(c) {
				if (c.cube) {
					queue.push(self.cubes.indexOf(c.cube));
				}
			});
		}

		return this.cubes.length === seenCount;
	}

	/**
	 * Performs a single siphon step: removes the cube at (0, 1) or (1, 0) and
	 * performs moves to refill it.
	 */
	*doSiphonStep(): Generator<Move, void, undefined> {
		printStep('Siphoning step');

		if (this.hasCube([2, 0]) || this.hasCube([2, 1])) {
			yield* this.doRightSiphonRemoval();
			yield* this.doSiphonFill(false);

		} else if (this.hasCube([0, 2]) || this.hasCube([1, 2])) {
			yield* this.doTopSiphonRemoval();
			yield* this.doSiphonFill(true);

		} else {
			printStep("Finish siphoning for the 2x2 block");
			if (this.hasCube([0, 1])) {
				yield* this.doRightSiphonRemoval();
				if (this.hasCube([1, 1])) {
					printMiniStep('Move cube at (1, 1) to siphon position');
					yield new Move(this, [1, 1], MoveDirection.S);
					yield* this.doRightSiphonRemoval();
				}
				if (this.hasCube([0, 1])) {
					yield* this.doTopSiphonRemoval();
				}
			} else if (this.hasCube([1, 0])) {
				yield* this.doTopSiphonRemoval();
				if (this.hasCube([1, 1])) {
					printMiniStep('Move cube at (1, 1) to siphon position');
					yield new Move(this, [1, 1], MoveDirection.W);
					yield* this.doTopSiphonRemoval();
				}
				if (this.hasCube([1, 0])) {
					yield* this.doRightSiphonRemoval();
				}
			}
		}
	}

	/**
	 * Removes the cube at (1, 0) and puts it in the line being built.
	 */
	*doRightSiphonRemoval(): Generator<Move, void, undefined> {
		printMiniStep('Siphon away (1, 0)');
		yield new Move(this, [1, 0], MoveDirection.SW);
		let x = 0;
		while (this.hasCube([x - 1, 0])) {
			yield new Move(this, [x, -1], MoveDirection.W);
			x--;
		}
		yield new Move(this, [x, -1], MoveDirection.WN);
	}

	/**
	 * Removes the cube at (0, 1) and puts it in the line being built.
	 */
	*doTopSiphonRemoval(): Generator<Move, void, undefined> {
		printMiniStep('Siphon away (0, 1)');
		let x = 0;
		while (this.hasCube([x - 1, 0])) {
			yield new Move(this, [x, 1], MoveDirection.W);
			x--;
		}
		yield new Move(this, [x, 1], MoveDirection.WS);
	}

	/**
	 * Fills the empty cell at (1, 0) or (0, 1) by executing a siphoning path.
	 * This is guaranteed to keep the configuration siphonable except possibly
	 * for a single parity cube, which can be removed by calling this method
	 * again.
	 *
	 * If viaLeft === false, this method fills the empty cell at (1, 0) by
	 * using a siphoning path along the bottom boundary.
	 *
	 * If viaLeft === true, this method fills the empty cell at (0, 1) by
	 * using a siphoning path along the left boundary.
	 */
	*doSiphonFill(viaLeft: boolean): Generator<Move, void, undefined> {

		// step 1: find the target
		const boundary = this.outsideCubes().map(b => b.p);

		// remove duplicated origin in the boundary
		boundary.pop();

		if (viaLeft) {
			// outsideCubes() returns the boundary in counter-clockwise order,
			// so if we want to follow the left boundary (upwards), we'll need
			// to reverse the boundary first
			boundary.reverse();

			// we need to ensure that the boundary won't start with (0, 0)
			// because otherwise we run into modulo issues later (trying to
			// access boundary[startIndex - 1], to be precise)

			// if we follow the bottom boundary, this is guaranteed by the
			// fact that when this method is called, the first cube will
			// already have been siphoned, so there is a cube in (-1, 0) that
			// outsideCubes() will use as its starting point

			// however, if we reverse the boundary, that is no longer true;
			// so, to fix this, we take the last boundary element, which is the
			// first one in the non-reversed boundary, and therefore guaranteed
			// not to be (0, 0), and shove it in the beginning
			boundary.unshift(boundary.pop()!);
		}

		let target = [0, 0];
		let targetIndex = -1;

		// start at the origin (0, 0), and find the first non-monotone boundary
		// edge, which has the target as its source
		let startIndex = -1;

		for (let i = 0; i < boundary.length; i++) {
			if (boundary[i][0] === 0 && boundary[i][1] === 0) {
				startIndex = i;
				break;
			}
		}

		// if we're following the bottom boundary, an edge is against direction
		// if it goes left; if we're following the left boundary, it is against
		// direction if it goes down
		let againstDirection = viaLeft ?
				((i: number) => boundary[i][1] < boundary[i - 1][1]) :
				((i: number) => boundary[i][0] < boundary[i - 1][0]);

		for (let i = startIndex; i < boundary.length; i++) {
			if (againstDirection(i)) {
				target = boundary[i - 1];
				targetIndex = i - 1;
				break;
			}
		}

		// step 2: if removing the target would result in a near parity cube,
		// take that cube instead

		const goal = viaLeft ? '(0, 1)' : '(1, 0)';
		const direction = viaLeft ? 'left' : 'bottom';

		// we can detect that this near cube would be a parity cube by seeing
		// that (1) it is the S-neighbor of the target, and (2) it has no
		// S-neighbor itself
		const potentialNearCube = boundary[targetIndex - 1];
		if (potentialNearCube[0] === target[0] - (viaLeft ? 1 : 0) &&
				potentialNearCube[1] === target[1] - (viaLeft ? 0 : 1) &&
				!this.hasCube([potentialNearCube[0] - (viaLeft ? 1 : 0), potentialNearCube[1] - (viaLeft ? 0 : 1)])) {
			printMiniStep(`Fill ${goal} again with a ${direction} boundary ` +
					`to (${boundary[targetIndex - 1][0]}, ` +
					`${boundary[targetIndex - 1][1]}) ` +
					`(not to (${target[0]}, ${target[1]}) ` +
					`because that would make ` +
					`(${boundary[targetIndex - 1][0]}, ` +
					`${boundary[targetIndex - 1][1]}) ` +
					`an unresolvable parity cube)`);
			target = boundary[targetIndex - 1];
			targetIndex--;
		} else {
			printMiniStep(`Fill ${goal} again with a ${direction} boundary ` +
					`siphoning path to (${target[0]}, ${target[1]})`);
		}

		// step 3: actually perform the move to eliminate the target

		// the beginning of the boundary will walk around the empty space
		// at (1, 0) we just created, and we need to walk around that to avoid
		// that (2, 1) -> (2, 0) is used (it being a non-monotone boundary
		// edge)
		
		// so add 4 to the start index to start with (2, 0) (or if (2, 0)
		// doesn't exist, add 2 to start with (1, 1))

		// (or the other way round if we're following the left boundary)
		if (this.hasCube(viaLeft ? [0, 2] : [2, 0])) {
			startIndex += 4;
		} else {
			startIndex += 2;
		}
		for (let i = startIndex; i <= targetIndex; i++) {
			let emptySpace = viaLeft ? [0, 1] : [1, 0];
			if (i > startIndex) {
				emptySpace = boundary[i - 1];
			}

			// special case: if we can do a SW move to boundary[i + 1], do it
			// (this is necessary because we may need to remove a parity cube
			// in the end of the path and we cannot do that with the regular
			// move path because it would disconnect the parity cube)
			if (i === targetIndex - 1 &&
					emptySpace[0] === boundary[i + 1][0] - 1 &&
					emptySpace[1] === boundary[i + 1][1] - 1 &&
					!this.hasCube([boundary[i + 1][0] - (viaLeft ? 1 : 0) , boundary[i + 1][1] - (viaLeft ? 0 : 1)])) {
				printMiniStep(`Fix parity cube ` +
						`(${boundary[i + 1][0]}, ${boundary[i + 1][1]}) ` +
						`made in the previous siphoning step by a corner move`);
				if (viaLeft) {
					yield new Move(this, boundary[i + 1], MoveDirection.WS);
				} else {
					yield new Move(this, boundary[i + 1], MoveDirection.SW);
				}
				i++;
				continue;
			}
			if (boundary[i][0] === emptySpace[0]) {
				yield new Move(this, boundary[i], MoveDirection.S);
			} else {
				yield new Move(this, boundary[i], MoveDirection.W);
			}
		}

		// step 4: if removing the target resulted in a far parity cube, do any
		// monotone move on that cube to get rid of it
		const potentialFarCube = boundary[targetIndex + 1];
		if (this.hasOneNeighbor(potentialFarCube)) {
			if (potentialFarCube[viaLeft ? 0 : 1] === 1) {
				printMiniStep(`We made a parity cube ` +
						`(${potentialFarCube[0]}, ${potentialFarCube[1]}), ` +
						`but we will fix it in the next siphoning step`);
			} else {
				printMiniStep(`Do monotone moves to remove parity cube ` +
						`(${potentialFarCube[0]}, ${potentialFarCube[1]})`);
				yield* this.doFreeMoves(potentialFarCube);
			}
		}
	}

	/**
	 * Do any free moves (W, S, SW, WS) possible, starting from the given cube,
	 * until it has N- and W neighbors.
	 */
	*doFreeMoves(p: [number, number]): Generator<Move, void, undefined> {
		let has;
		while (has = this.neighbors(p), !has['W'] || !has["N"]) {
			let move = new Move(this, p, MoveDirection.W);
			if (p[0] > 1 && move.isValid()) {
				yield move;
				p[0]--;
				continue;
			}
			move = new Move(this, p, MoveDirection.S);
			if (p[1] > 1 && move.isValid()) {
				yield move;
				p[1]--;
				continue;
			}
			move = new Move(this, p, MoveDirection.SW);
			if (p[0] > 1 && p[1] > 1 && move.isValid()) {
				yield move;
				p[0]--;
				p[1]--;
				continue;
			}
			move = new Move(this, p, MoveDirection.WS);
			if (p[0] > 1 && p[1] > 1 && move.isValid()) {
				yield move;
				p[0]--;
				p[1]--;
				continue;
			}
			//throw 'no free move available to remove parity cube';
			break;
		}
	}

	/**
	 * Checks if a cube has only one neighbor (in 4-connectivity), that is, if
	 * it is a ‘dead end’.
	 */
	hasOneNeighbor(p: [number, number]): boolean {
		const has = this.neighbors(p);
		let count = 0;
		if (has['N']) {
			count++;
		}
		if (has['E']) {
			count++;
		}
		if (has['S']) {
			count++;
		}
		if (has['W']) {
			count++;
		}
		return count === 1;
	}

	/**
	 * Return all gaps, sorted descending on x-coordinate, then in case of
	 * ties descending on y-coordinate.
	 */
	gaps(): [number, number][] {

		// TODO fix this to be our new definition of a gap

		const [minX, minY, , ] = this.bounds();

		// find all empty cells (empty cell: cell without a cube that has E and NE neighbors)
		return this.cubes
			.map((cube): [number, number] => [cube.p[0] - 1, cube.p[1] - 1])
			.filter((p) => this.isEmptyCell(p))
			.filter((p) => p[0] >= minX && p[1] >= minY)
			.sort(([x1, y1], [x2, y2]) => {
				if (x1 === x2) {
					return y2 - y1;
				}
				return x2 - x1;
			});
	}

	isDeflatable([x, y]: [number, number]): boolean {
		return this.isEmptyCell([x, y]) &&
				this.isInside([x, y]);
	}

	isInflatable([x, y]: [number, number]): boolean {
		if (!this.isEmptyCell([x, y])) {
			return false;
		}

		return (this.getCube([x + 1, y])!.connectivity === 2) &&
				(this.getCube([x + 1, y + 1])!.connectivity === 2) &&
				(this.getCube([x, y + 1])!.connectivity === 2);
	}

	isEmptyCell([x, y]: [number, number]): boolean {
		if (this.getCube([x, y])) {
			return false;
		}

		const has = this.neighbors([x, y]);
		return has['N'] && has['NE'] && has['E'];
	}

	/**
	 * Performs an inflate move to fill the given gap.
	 */
	*doInflate([x, y]: [number, number]): Generator<Move, void, undefined> {
		printStep(`Inflate move to fill gap (${x}, ${y})`);
		yield new Move(this, [x + 1, y], MoveDirection.W);
		yield new Move(this, [x + 1, y + 1], MoveDirection.S);
	}

	/**
	 * Performs a deflate move to fill the given gap.
	 */
	*doDeflate([x, y]: [number, number]): Generator<Move, void, undefined> {

		printStep(`Deflate move to fill gap (${x}, ${y})`);
		const xOriginal = x;

		while (this.needsTuck([x, y])) {
			printMiniStep('Row is longer than surrounding rows, so tuck to maintain connectivity');
			yield* this.doTuck([x, y]);
		}

		printMiniStep(`Move row to the right of (${x}, ${y}) to the left`);
		while (this.hasCube([x + 1, y])) {
			yield new Move(this, [x + 1, y], MoveDirection.W);
			x++;
		}
		// if did only one step, we need to tuck the last cube in the previous
		// into the gap, because otherwise we break 2-connectivity
		if (x === xOriginal + 1) {
			printMiniStep('Do extra tuck from the row above to maintain 2-connectivity');
			yield* this.doTuck([x, y + 1]);
		}
		printMiniStep(`Bubbling done because (${x + 1}, ${y}) is empty`);
	}

	/**
	 * Checks if (one or more) tucks are needed to move the row of cubes to the
	 * right of the given coordinate to the left.
	 */
	needsTuck([x, y]: [number, number]): boolean {
		while (this.hasCube([x + 1, y])) {
			if (!this.hasCube([x + 1, y + 1]) && !this.hasCube([x + 1, y - 1])) {
				return true;
			}
			x++;
		}
		return false;
	}

	/**
	 * Starting from the given position, walk to the right until the last cube,
	 * and shove that cube to the next row.
	 */
	*doTuck([x, y]: [number, number]): Generator<Move, void, undefined> {
		while (this.hasCube([x + 1, y])) {
			x++;
		}
		if (this.hasCube([x - 1, y - 1])) {
			yield new Move(this, [x, y], MoveDirection.S);
			return;
		}
		yield new Move(this, [x, y], MoveDirection.SW);
		x--;
		while (!this.hasCube([x - 1, y - 1])) {
			yield new Move(this, [x, y - 1], MoveDirection.W);
			x--;
		}
	}

	updatePositions(time: number, timeStep: number): void {
		this.cubes.forEach((cube) => {
			cube.updatePosition(time, timeStep);
		});
		if (this.currentMove) {
			const p = this.currentMove.position;
			this.getCube(p)?.updatePosition(time, timeStep, this.currentMove);
		}
	}

	/**
	 * Puts all cubes back in their starting location.
	 */
	reset(): void {
		this.cubes.forEach((cube) => {
			this.getCell(cube.p).cube = null;
		});
		this.cubes.forEach((cube) => {
			cube.p = [cube.resetPosition[0], cube.resetPosition[1]];
			cube.dots = [];
			cube.dotsLayer.removeChildren();
			this.getCell(cube.p).cube = cube;
		});
	}

	/**
	 * Checks if the configuration is connected. If the skip parameter is
	 * provided, that cube is ignored (considered as non-existing).
	 */
	isConnected(skip?: [number, number]): boolean {
		if (!this.cubes.length) {
			return true;
		}

		// do BFS from cube 0 to check if we can reach all cubes
		let seen = Array(this.cubes.length).fill(false);
		let seenCount = 0;
		let queue = [0];

		if (skip) {
			// mark the skipped cube so we won't visit it again
			const skipCube = this.getCube(skip);
			if (skipCube) {
				const skipIndex = this.cubes.indexOf(skipCube);
				seen[skipIndex] = true;
				seenCount++;

				// special case: if we were about to start our BFS with the
				// skipped cube, then pick another cube to start with
				// (note that if the configuration has exactly 1 cube, which
				// is then skipped, the function should return true
				// but that works because the BFS starting at the skipped
				// cube will not encounter any cubes)
				if (skipIndex === 0 && this.cubes.length > 1) {
					queue = [1];
				}
			}
		}

		while (queue.length !== 0) {
			const cubeId = queue.shift()!;
			if (seen[cubeId]) {
				continue;
			}
			
			const cube = this.cubes[cubeId];
			seen[cubeId] = true;
			seenCount++;

			const neighbors = [
				this.getCell([cube.p[0] - 1, cube.p[1]]),
				this.getCell([cube.p[0] + 1, cube.p[1]]),
				this.getCell([cube.p[0], cube.p[1] - 1]),
				this.getCell([cube.p[0], cube.p[1] + 1])
			];
			const self = this;
			neighbors.forEach(function(c) {
				if (c.cube) {
					queue.push(self.cubes.indexOf(c.cube));
				}
			});
		}

		return this.cubes.length === seenCount;
	}

	/**
	 * Checks if the given grid cell is within a hole of the configuration.
	 * (Assuming 4-connectivity.)
	 */
	isInside(p: [number, number]): boolean {
		// try to find a path to
		const bounds = this.bounds();
		const origin: [number, number] = [bounds[0] - 1, bounds[1] - 1];

		// do a BFS from the origin, to see if we can find p
		// (FIXME: this is stupid, can probably be done better...)
		let seen: {[key: string]: boolean} = {};
		let queue: [number, number][] = [origin];

		while (queue.length !== 0) {
			const location = queue.shift()!;
			if (location[0] < bounds[0] - 1 || location[1] < bounds[1] - 1 ||
					location[0] > bounds[2] + 1 || location[1] > bounds[3] + 1) {
				continue;
			}
			if (seen[location[0] + "," + location[1]]) {
				continue;
			}
			seen[location[0] + "," + location[1]] = true;
			if (location[0] === p[0] && location[1] === p[1]) {
				// done!
				return false;
			}

			const neighbors: [number, number][] = [
				[location[0] - 1, location[1]],
				[location[0] + 1, location[1]],
				[location[0], location[1] - 1],
				[location[0], location[1] + 1]
			];
			const self = this;
			neighbors.forEach(function(c) {
				if (!self.hasCube(c)) {
					queue.push(c);
				}
			});
		}

		return true;
	}

	/**
	 * Returns the minimum and maximum x- and y-coordinates of cubes in the
	 * configuration, as an array [minX, minY, maxX, maxY].
	 */
	bounds(): [number, number, number, number] {
		return [
			this.cubes.map((cube) => cube.p[0]).min(),
			this.cubes.map((cube) => cube.p[1]).min(),
			this.cubes.map((cube) => cube.p[0]).max(),
			this.cubes.map((cube) => cube.p[1]).max()
		];
	}

	/**
	 * Returns the leftmost cube in the downmost row that contains cubes.
	 */
	downmostLeftmost(): Cube | null {
		if (!this.cubes.length) {
			return null;
		}

		const lowestY = this.cubes
			.map((cube) => cube.p[1])
			.min();

		const lowestX = this.cubes
			.filter((cube) => cube.p[1] === lowestY)
			.map((cube) => cube.p[0])
			.min();

		return this.getCube([lowestX, lowestY]);
	}

	*buildBestBridge(): Generator<Move, void, undefined> {

		// TODO the following are debugging tests ...

		//let path = this.shortestCubePath(this.downmostLeftmost()!, this.getCube(2, 11)!);
		//console.log(path.map(cube => cube.p));
		
		//for (let i = 0; i < this.cubes.length; i++) {
		//	console.log(this.cubes[i].p + " -> " + this.bridgeCapacity(this.cubes[i]));
		//}
		
		/*const components = this.findComponents();
		for (let i = 0; i < this.cubes.length; i++) {
			console.log(this.cubes[i].p + " -> " + components[i]);
		}
		console.log(this.countOneComponentCubes());*/

		//console.log(this.bridgeCapacity(this.getCube(0, 10)!).map(b => b.p[0] + " " + b.p[1]));
		
		// for each pair of cubes, find out how good the bridge between them is
		let bestFrom = -1;
		let bestTo = -1;
		let bestValue = 0;
		for (let i = 0; i < this.cubes.length; i++) {
			for (let j = 0; j < this.cubes.length; j++) {
				if (this.bridgePossible(this.cubes[i], this.cubes[j])) {
					const value = this.bridgeValue(this.cubes[i], this.cubes[j]);
					if (value > bestValue) {
						bestFrom = i;
						bestTo = j;
						bestValue = value;
					}
				}
			}
		}
		const from = this.cubes[bestFrom];
		const to = this.cubes[bestTo];
		printStep(`Build bridge (${from.p}) \u2192 (${to.p})`);
		yield* this.buildBridge(this.cubes[bestFrom], this.cubes[bestTo]);
	}

	/**
	 * Returns the number of cubes in 1-components.
	 */
	countOneComponentCubes(): number {
		const components = this.findComponents();
		return components.filter(i => (i === 1)).length;
	}

	/**
	 * Colors the cubes by their connectivity, and set their connectivity
	 * fields.
	 */
	markComponents(): void {
		const components = this.findComponents();
		for (let i = 0; i < this.cubes.length; i++) {
			this.cubes[i].connectivity = components[i];
			if (components[i] === 2) {
				this.cubes[i].setComponentStatus(ComponentStatus.TWO_COMPONENT);
			} else if (components[i] === 1) {
				this.cubes[i].setComponentStatus(ComponentStatus.ONE_COMPONENT);
			} else if (components[i] === 3) {
				this.cubes[i].setComponentStatus(ComponentStatus.CROSS);
			} else {
				this.cubes[i].setComponentStatus(ComponentStatus.NONE);
			}
		}
	}

	/**
	 * Returns a list of component values for each cube.
	 *
	 * 1 and 2 mean that the cube is in a 1- or 2-component, respectively,
	 * while 3 means that the cube is a cross cube (that is, in more than one
	 * component).
	 */
	findComponents(): number[] {

		let components = Array(this.cubes.length).fill(-1);

		// don't try to find components if the configuration is disconnected
		if (!this.isConnected()) {
			return components;
		}

		let seen = Array(this.cubes.length).fill(false);
		let outside = this.outsideCubes();
		let stack = [];

		//console.log('start walk');

		// walk over the outside
		for (let i = 0; i < outside.length; i++) {
			const cube = outside[i];
			const cubeId = this.cubes.indexOf(cube);
			//console.log('cube', JSON.stringify(cube.p), 'stack', JSON.stringify(stack.map(c => this.cubes[c].p)));

			// if we've not seen this cube, put it on the stack
			// else mark its component and pop it
			if (!seen[cubeId]) {
				seen[cubeId] = true;
				stack.push(cubeId);
			} else if (stack.length >= 1 && stack[stack.length - 2] === cubeId) {
				let cId = stack.pop()!;
				if (components[cId] === -1) {
					components[cId] = 1;
				}
				components[cubeId] = 1;
			} else {
				// pop entire 2-component in one go
				while (stack.length > 1 && stack[stack.length - 1] !== cubeId) {
					let cId = stack.pop()!;
					components[cId] = components[cId] !== -1 ? 3 : 2;
				}
				// mark attachment point as cross (except if stack is empty)
				let cId = stack[stack.length - 1];
				components[cId] = stack.length > 1 ? 3 : 2;
				//i++;
			}
		}

		// if origin wasn't put in a component yet, it needs to be a
		// 1-component
		let originId = this.cubes.indexOf(outside[0]);
		if (components[originId] === -1) {
			components[originId] = 1;
		}

		return components;
	}

	/**
	 * Returns a list of cubes on the outside of the configuration, in
	 * counter-clockwise order, starting with the downmost-leftmost cube.
	 * The downmost-leftmost cube is included twice (both as the first and as
	 * the last element in the list).
	 */
	outsideCubes(): Cube[] {
		if (!this.cubes.length) {
			return [];
		}
		const start = this.downmostLeftmost()!;
		let outside: Cube[] = [];
		let edgesSeen = new Set();
		let position: [number, number] = [start.p[0], start.p[1]];
		let direction: string | null = 'S';
		while (true) {
			let cube = this.getCube(position)!;
			outside.push(cube);
			direction = this.nextOnOutside(position, direction);
			if (!direction) {
				break;
			}
			let newEdge = cube.p[0] + " " + cube.p[1] + " " + direction;
			if (edgesSeen.has(newEdge)) {
				break;
			}
			edgesSeen.add(newEdge);
			switch (direction) {
				case 'N':
					position[1]++;
					break;
				case 'E':
					position[0]++;
					break;
				case 'S':
					position[1]--;
					break;
				case 'W':
					position[0]--;
					break;
			}
		}
		return outside;
	}

	/**
	 * Given a position and the direction of the previous segment of the
	 * outside, returns the direction of the next outside segment.
	 */
	private nextOnOutside(p: [number, number], direction: string): string | null {
		const has = this.neighbors(p);
		const bends: {[key: string]: string[]} = {
			'N': ['E', 'N', 'W', 'S'],
			'E': ['S', 'E', 'N', 'W'],
			'S': ['W', 'S', 'E', 'N'],
			'W': ['N', 'W', 'S', 'E'],
		};
		for (let i = 0; i < 4; i++) {
			const dir = bends[direction][i];
			if (has[dir]) {
				return dir;
			}
		}
		return null;
	}

	/**
	 * Checks if a bridge is possible between the given cubes. A bridge is
	 * possible if the source cube's bridge capacity is large enough, and the
	 * bridge won't overlap existing cubes.
	 */
	bridgePossible(from: Cube, to: Cube): boolean {
		const cellsToTake = this.bridgeCapacity(from);
		const cellsToFill = this.bridgeCells(from.p, to.p);
		if (cellsToTake.length < cellsToFill.length) {
			return false;
		}

		for (let i = 0; i < cellsToFill.length; i++) {
			if (this.hasCube(cellsToFill[i])) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Computes the value of the bridge between the given cubes. The value of
	 * a bridge is the number of cubes in a 1-component that get changed into
	 * being in a 2-component by building that bridge.
	 */
	bridgeValue(from: Cube, to: Cube): number {
		const before = this.countOneComponentCubes();

		const cellsToTake = this.bridgeCapacity(from).map(cube => cube.p);
		const cellsToFill = this.bridgeCells(from.p, to.p);

		// we are now going to ‘virtually’ build the bridge so that we can
		// count 1-component cubes in that situation, but we need to be
		// careful to revert the situation afterwards!
		for (let i = 0; i < cellsToFill.length; i++) {
			this.moveCube(cellsToTake[i], cellsToFill[i]);
		}
		const after = this.countOneComponentCubes();
		for (let i = cellsToFill.length - 1; i >= 0; i--) {
			this.moveCube(cellsToFill[i], cellsToTake[i]);
		}

		return before - after;
	}

	/**
	 * Builds a bridge between the given cubes.
	 */
	*buildBridge(from: Cube, to: Cube): Generator<Move, void, undefined> {
		const cubesToTake = this.bridgeCapacity(from);
		const cellsToFill = this.bridgeCells(from.p, to.p);

		for (let i = 0; i < cellsToFill.length; i++) {
			yield* this.shortestMovePath(cubesToTake[i].p, cellsToFill[i]);
		}
	}

	/**
	 * Given a cube, determines a list of cubes that are available to build a
	 * bridge from there. The list is ordered such that the cubes can be taken
	 * one by one from the front.
	 */
	bridgeCapacity(b: Cube): Cube[] {

		// do a BFS from b, but ignore all cubes that are on the shortest path
		// from the root to b
		let seen = Array(this.cubes.length).fill(false);
		const path = this.shortestCubePath(this.downmostLeftmost()!, b);
		const self = this;
		path.forEach(cube => {
			seen[self.cubes.indexOf(cube)] = true;
		});
		let bId = this.cubes.indexOf(b);
		seen[bId] = false;
		let queue = [bId];
		let availableCubes: Cube[] = [];

		while (queue.length !== 0) {
			const cubeId = queue.shift()!;
			if (seen[cubeId]) {
				continue;
			}
			
			const cube = this.cubes[cubeId];
			seen[cubeId] = true;
			if (bId !== cubeId) {
				availableCubes.push(cube);
			}

			const neighbors = [
				this.getCell([cube.p[0] - 1, cube.p[1]]),
				this.getCell([cube.p[0] + 1, cube.p[1]]),
				this.getCell([cube.p[0], cube.p[1] - 1]),
				this.getCell([cube.p[0], cube.p[1] + 1])
			];
			const self = this;
			neighbors.forEach(function(c) {
				if (c.cube) {
					queue.push(self.cubes.indexOf(c.cube));
				}
			});
		}

		return availableCubes.reverse();
	}

	/**
	 * Returns the shortest path in the 4-adjacency graph between the given
	 * source and target cubes.
	 */
	shortestCubePath(from: Cube, to: Cube): Cube[] {

		// do a BFS
		let seen = Array(this.cubes.length).fill(false);
		let parent: (Cube | null)[] = Array(this.cubes.length).fill(null);
		let queue: [number, Cube | null][] = [[this.cubes.indexOf(from), null]];

		while (queue.length !== 0) {
			const [cubeId, p] = queue.shift()!;
			if (seen[cubeId]) {
				continue;
			}
			
			const cube = this.cubes[cubeId];
			seen[cubeId] = true;
			parent[cubeId] = p;

			const neighbors = [
				this.getCell([cube.p[0] - 1, cube.p[1]]),
				this.getCell([cube.p[0] + 1, cube.p[1]]),
				this.getCell([cube.p[0], cube.p[1] - 1]),
				this.getCell([cube.p[0], cube.p[1] + 1])
			];
			const self = this;
			neighbors.forEach(function(c) {
				if (c.cube) {
					queue.push([self.cubes.indexOf(c.cube), cube]);
				}
			});
		}

		// reconstruct the path
		let cube = to;
		let path = [to];
		while (cube.p[0] !== from.p[0] || cube.p[1] !== from.p[1]) {
			cube = parent[this.cubes.indexOf(cube)]!;
			path.unshift(cube);
		}

		return path;
	}

	/**
	 * Returns the list of cells that need to be filled to build a bridge
	 * between the given cubes.
	 */
	bridgeCells(from: [number, number], to: [number, number]): [number, number][] {
		let cells: [number, number][] = [];

		let [x1, y1] = from;
		let [x2, y2] = to;

		// vertical part
		if (y2 < y1) {
			for (let y = y1; y > y2; y--) {
				cells.push([x1, y]);
			}
		} else {
			for (let y = y1; y < y2; y++) {
				cells.push([x1, y]);
			}
		}

		// horizontal part
		if (x2 < x1) {
			for (let x = x1; x > x2; x--) {
				cells.push([x, y2]);
			}
		} else {
			for (let x = x1; x < x2; x++) {
				cells.push([x, y2]);
			}
		}

		// remove the source cube itself
		cells.shift();

		return cells;
	}

	/**
	 * Generates a JSON string from this world.
	 */
	serialize(): string {
		let cubes: any = [];
		this.cubes.forEach((cube) => {
			cubes.push({
				'x': cube.resetPosition[0],
				'y': cube.resetPosition[1],
				'color': [cube.color.r, cube.color.g, cube.color.b]
			});
		});
		let obj: any = {
			'_version': 1,
			'cubes': cubes
		};
		return JSON.stringify(obj);
	}

	/**
	 * Parses a JSON string back into this world. Make sure this is an empty
	 * world before calling this method.
	 */
	deserialize(data: string): void {
		let obj: any = JSON.parse(data);

		if (obj['_version'] > 1) {
			throw 'Save file with incorrect version';
		}

		let cubes: any[] = obj['cubes'];
		cubes.forEach((cube: any) => {
			let color = Color.BLUE;
			if (cube.hasOwnProperty('color')) {
				color = new Color(cube['color'][0],
					cube['color'][1], cube['color'][2]);
			}
			this.addCube([cube['x'], cube['y']], color);
		});
	}

	/**
	 * Generates an Ipe drawing from this world.
	 */
	toIpe(): string {
		let header = '<ipeselection pos="0 0">\n';
		let footer = '</ipeselection>\n';

		let elements = '';

		// shadows
		this.cubes.forEach((cube) => {
			let x = 8 * cube.p[0];
			let y = 8 * cube.p[1];
			elements += `<path stroke="Gray 0.7" fill="Gray 0.7" pen="heavier" cap="1" join="1">
${x + 8} ${y + 8} m
${x + 9} ${y + 7} l
${x + 9} ${y - 1} l
${x + 1} ${y - 1} l
${x} ${y} l
${x + 8} ${y} l
h
</path>\n`;
		});

		// cubes
		this.cubes.forEach((cube) => {
			let x = 8 * cube.p[0];
			let y = 8 * cube.p[1];
			elements += `<path stroke="black" fill="Gray 0.9" pen="heavier" cap="1" join="1">
${x} ${y + 8} m
${x} ${y} l
${x + 8} ${y} l
${x + 8} ${y + 8} l
h
</path>\n`;

			switch (cube.componentStatus) {
				case ComponentStatus.TWO_COMPONENT:
					elements += `<use layer="cubes" name="mark/square(sx)" pos="${x + 4} ${y + 4}" size="normal" stroke="Bettina blue"/>\n`;
					break;
				case ComponentStatus.ONE_COMPONENT:
					elements += `<use layer="cubes" name="mark/disk(sx)" pos="${x + 4} ${y + 4}" size="normal" stroke="Bettina red"/>\n`;
					break;
				case ComponentStatus.CROSS:
					elements += `<use layer="cubes" name="mark/cross(sx)" pos="${x + 4} ${y + 4}" size="4" stroke="Gray 0.2"/>\n`;
					break;
			}
		});
		
		return header + elements + footer;
	}
}

export {World, Move};

