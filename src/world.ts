import * as PIXI from 'pixi.js';
import {Viewport} from 'pixi-viewport';

import {Cube, Color, ComponentStatus} from './cube';

type WorldCell = {
	cubeId: number | null;
};

type Algorithm = Generator<Move, void, undefined>;

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

		let has = this.world.hasNeighbors(this.position);

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
 * Representation of the component tree.
 */
class ComponentTree {
	componentType: number;
	outsideCubes: Cube[] = [];
	children: ComponentTree[] = [];

	constructor(componentType: number) {
		this.componentType = componentType;
	}

	centerOfMass(): [number, number] {
		let n = this.outsideCubes.length;
		if (n === 0) {
			return [0, 0];
		}
		let xSum = 0, ySum = 0;
		for (let cube of this.outsideCubes) {
			xSum += cube.p[0];
			ySum += cube.p[1];
		}
		return [xSum / n, ySum / n];
	}

	paintOn(pixi: PIXI.Graphics, parent?: ComponentTree): void {
		let [x, y] = this.centerOfMass();
		x *= 80;
		y *= -80;

		pixi.lineStyle(8, 0x222222);

		if (parent) {
			let [px, py] = parent.centerOfMass();
			px *= 80;
			py *= -80;
			pixi.moveTo(px, py);
			pixi.lineTo(x, y);
		}

		if (this.componentType === 2) {
			pixi.beginFill(0x0066CB);
			pixi.moveTo(x - 27, y - 27);
			pixi.lineTo(x + 27, y - 27);
			pixi.lineTo(x + 27, y + 27);
			pixi.lineTo(x - 27, y + 27);
			pixi.closePath();
			pixi.endFill();
		} else if (this.componentType === 1) {
			pixi.beginFill(0xD5004A);
			pixi.drawCircle(x, y, 28);
			pixi.endFill();
		}

		for (let child of this.children) {
			child.paintOn(pixi, this);
		}
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
	treePixi = new PIXI.Graphics();
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

		this.treePixi.visible = false;
		this.viewport.addChild(this.treePixi);

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
				cubeId: null
			};
		}
		return column[y];
	}

	/**
	 * Returns the ID of the cube at the given location, or null if that cell is empty.
	 */
	getCubeId(p: [number, number]): number | null {
		return this.getCell(p).cubeId;
	}

	/**
	 * Returns the cube at the given location, or null if that cell is empty.
	 */
	getCube(p: [number, number]): Cube | null {
		const id = this.getCubeId(p);
		if (id === null) {
			return null;
		}
		return this.cubes[id];
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
		const cube = this.addCubeUnmarked(p, color);
		this.markComponents();
		return cube;
	}

	/**
	 * As addCube(), but does not update the component status of the cubes.
	 */
	addCubeUnmarked(p: [number, number], color: Color): Cube {
		if (this.hasCube(p)) {
			throw `Tried to insert cube on top of another cube ` +
					`at (${p[0]}, ${p[1]})`;
		}
		const cube = new Cube(this, p, color);
		this.getCell(p).cubeId = this.cubes.length;
		this.cubes.push(cube);
		this.pixi.addChild(cube.pixi);
		this.backgroundPixi.addChild(cube.backgroundPixi);
		return cube;
	}

	/**
	 * Moves the cube from the given source location to the given target
	 * location. Throws if no cube exists at the source or if a cube already
	 * exists at the target.
	 */
	moveCube(from: [number, number], to: [number, number]): void {
		this.moveCubeUnmarked(from, to);
		this.markComponents();
	}

	/**
	 * As moveCube(), but does not update the component status of the cubes.
	 */
	moveCubeUnmarked(from: [number, number], to: [number, number]): void {
		if (!this.hasCube(from)) {
			throw `Tried to move non-existing cube at ` +
					`at (${from[0]}, ${from[1]})`;
		}

		if (this.hasCube(to)) {
			throw `Tried to move cube on top of another cube ` +
					`at (${to[0]}, ${to[1]})`;
		}

		const id = this.getCubeId(from)!;
		this.getCell(from).cubeId = null;
		this.getCell(to).cubeId = id;
		this.cubes[id].p = [to[0], to[1]];
		this.cubes[id].updatePosition(0, 0);
	}

	/**
	 * Removes the cube at the given location; throws if no cube exists there.
	 */
	removeCube(p: [number, number]): void {
		this.removeCubeUnmarked(p);
		this.markComponents();
	}

	/**
	 * As removeCube(), but does not update the component status of the cubes.
	 */
	removeCubeUnmarked(p: [number, number]): void {
		if (!this.hasCube(p)) {
			throw `Tried to remove non-existing cube ` +
					`at (${p[0]}, ${p[1]})`;
		}
		const cube = this.getCube(p)!;
		this.getCell(p).cubeId = null;
		this.pixi.removeChild(cube.pixi);
		this.backgroundPixi.removeChild(cube.backgroundPixi);
		this.cubes = this.cubes.filter((b) => b !== cube);
		// because removing the cube from this.cubes changes the indices, we
		// need to update the cubeIds as well
		for (let i = 0; i < this.cubes.length; i++) {
			this.getCell(this.cubes[i].p).cubeId = i;
		}
	}

	/**
	 * Returns an object with keys 'N', 'NE', 'E', etc. with booleans
	 * indicating if the given cell has neighboring cubes in that direction.
	 */
	hasNeighbors(p: [number, number]): {[key: string]: boolean} {
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
	 * Returns a move from and to the given coordinates.
	 */
	getMoveTo(source: Cube, target: [number, number]): Move | null {
		const moves = this.validMovesFrom(source.p);
		for (let move of moves) {
			if (move.targetPosition()[0] === target[0] &&
					move.targetPosition()[1] === target[1]) {
				return move;
			}
		}
		return null;
	}

	/**
	 * Executes the shortest move path between the given cubes.
	 *
	 * Throws if no move path is possible.
	 *
	 * @param from The source coordinate, containing the cube we want to move.
	 * @param to The target coordinate, which should be an empty cell.
	 */
	*shortestMovePath(from: [number, number], to: [number, number]): Algorithm {
		
		// temporarily remove the origin cube from the configuration, to avoid
		// invalid moves in the resulting move path (because we could slide
		// along the origin cube itself)
		const cube = this.getCube(from);
		if (cube === null) {
			throw "Cannot compute move path from non-existing cube" +
				` (${from[0]}, ${from[1]})`;
		}
		this.removeCubeUnmarked(from);

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

		// put the origin cube back
		const newCube = this.addCubeUnmarked(cube.p, cube.color);
		newCube.componentStatus = cube.componentStatus;

		yield* path;
	}

	nextStep(algorithm: Algorithm, step: number): void {

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

	/**
	 * Finds all parity cubes (1-components with consisting of only a single
	 * cube) and returns them in order around the boundary of the
	 * configuration.
	 */
	findParityCubes(): Cube[] {
		let parityCubes: Cube[] = [];

		const outside = this.outsideCubes();
		for (let i = 1; i < outside.length - 1; i++) {
			if (outside[i - 1] === outside[i + 1] &&
					outside[i - 1].componentStatus === ComponentStatus.CONNECTOR) {
				parityCubes.push(outside[i]);
			}
		}
		if (outside.length > 1 &&
				outside[outside.length - 2] === outside[1] &&
				outside[1].componentStatus === ComponentStatus.CONNECTOR) {
			parityCubes.push(outside[0]);
		}

		return parityCubes;
	}

	/**
	 * Given two parity cubes, move the first parity cube to be adjacent to the
	 * second one, so that they are both not parity cubes anymore.
	 */
	*mergeParityCubes(c1: Cube, c2: Cube): Algorithm {
		let [x, y] = c2.p;
		let has = this.hasNeighbors(c2.p);
		let target: [number, number];
		if (has['N']) {
			target = [x - 1, y];
		} else if (has['W']) {
			target = [x, y - 1];
		} else if (has['S']) {
			target = [x + 1, y];
		} else if (has['E']) {
			target = [x, y + 1];
		}
		yield* this.shortestMovePath(c1.p, target!);
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
		let originId = this.getCubeId([0, 0]);

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
			topRightNeighbors.forEach(function(c) {
				if (c.cubeId) {
					queue.push(c.cubeId);
				}
			});
		}

		return this.cubes.length === seenCount;
	}

	columnEmpty(x: number): boolean {
		for (let cube of this.cubes) {
			if (cube.p[0] === x) {
				return false;
			}
		}
		return true;
	}

	rowEmpty(y: number): boolean {
		for (let cube of this.cubes) {
			if (cube.p[1] === y) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Performs a single siphon step: removes the cube at (0, 1) or (1, 0) and
	 * performs moves to refill it.
	 */
	*doSiphonStep(): Algorithm {
		printStep('Siphoning step');

		if (!this.columnEmpty(2)) {
			yield* this.doRightSiphonRemoval();
			yield* this.doSiphonFill(false);

		} else if (!this.rowEmpty(2)) {
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
	*doRightSiphonRemoval(): Algorithm {
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
	*doTopSiphonRemoval(): Algorithm {
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
	*doSiphonFill(viaLeft: boolean): Algorithm {

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
		let detectedNearParityCube = false;

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
			detectedNearParityCube = true;
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
		if (this.hasOneNeighbor(this.getCube(potentialFarCube)!)) {
			if (detectedNearParityCube) {
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
	*doFreeMoves(p: [number, number]): Algorithm {
		let has;
		while (has = this.hasNeighbors(p), !has['W'] || !has["N"]) {
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
			if (p[0] > 2 && p[1] > 0 && move.isValid()) {
				yield move;
				p[0]--;
				p[1]--;
				continue;
			}
			move = new Move(this, p, MoveDirection.WS);
			if (p[0] > 0 && p[1] > 2 && move.isValid()) {
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
	 * Returns the degree of the given cube (in 4-connectivity).
	 */
	degree(c: Cube): number {
		const has = this.hasNeighbors(c.p);
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
		return count;
	}

	/**
	 * Checks if a cube has only one neighbor (in 4-connectivity), that is, if
	 * it is a ‘dead end’.
	 */
	hasOneNeighbor(c: Cube): boolean {
		return this.degree(c) === 1;
	}

	/**
	 * Returns a neighbor of the given cube.
	 */
	getOneNeighbor(c: Cube): Cube | null {
		const [x, y] = c.p;
		let neighbor = this.getCube([x + 1, y]);
		if (neighbor) {
			return neighbor;
		}
		neighbor = this.getCube([x - 1, y]);
		if (neighbor) {
			return neighbor;
		}
		neighbor = this.getCube([x, y + 1]);
		if (neighbor) {
			return neighbor;
		}
		neighbor = this.getCube([x, y - 1]);
		if (neighbor) {
			return neighbor;
		}
		return null;
	}

	/**
	 * Returns all neighbors of the given grid coordinate.
	 */
	getNeighbors([x, y]: [number, number]): Cube[] {
		let neighbors = [];
		let neighbor = this.getCube([x + 1, y]);
		if (neighbor) {
			neighbors.push(neighbor);
		}
		neighbor = this.getCube([x - 1, y]);
		if (neighbor) {
			neighbors.push(neighbor);
		}
		neighbor = this.getCube([x, y + 1]);
		if (neighbor) {
			neighbors.push(neighbor);
		}
		neighbor = this.getCube([x, y - 1]);
		if (neighbor) {
			neighbors.push(neighbor);
		}
		return neighbors;
	}

	/**
	 * Returns all neighbors of the given grid coordinate, as a dictionary
	 * mapping compass directions to Cubes.
	 */
	getNeighborMap([x, y]: [number, number]): {[direction: string]: Cube | null} {
		let neighbors: {[direction: string]: Cube | null} = {};
		neighbors['N'] = this.getCube([x, y + 1]);
		neighbors['E'] = this.getCube([x + 1, y]);
		neighbors['W'] = this.getCube([x - 1, y]);
		neighbors['S'] = this.getCube([x, y - 1]);
		neighbors['NE'] = this.getCube([x + 1, y + 1]);
		neighbors['NW'] = this.getCube([x - 1, y + 1]);
		neighbors['SW'] = this.getCube([x - 1, y - 1]);
		neighbors['SE'] = this.getCube([x + 1, y - 1]);
		return neighbors;
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

		return false; // TODO implement

		//return (this.getCube([x + 1, y])!.connectivity === 2) &&
		//		(this.getCube([x + 1, y + 1])!.connectivity === 2) &&
		//		(this.getCube([x, y + 1])!.connectivity === 2);
	}

	isEmptyCell([x, y]: [number, number]): boolean {
		if (this.getCube([x, y])) {
			return false;
		}

		const has = this.hasNeighbors([x, y]);
		return has['N'] && has['NE'] && has['E'];
	}

	/**
	 * Performs an inflate move to fill the given gap.
	 */
	*doInflate([x, y]: [number, number]): Algorithm {
		printStep(`Inflate move to fill gap (${x}, ${y})`);
		yield new Move(this, [x + 1, y], MoveDirection.W);
		yield new Move(this, [x + 1, y + 1], MoveDirection.S);
	}

	/**
	 * Performs a deflate move to fill the given gap.
	 */
	*doDeflate([x, y]: [number, number]): Algorithm {

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
	*doTuck([x, y]: [number, number]): Algorithm {
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
			this.getCell(cube.p).cubeId = null;
		});
		for (let i = 0; i < this.cubes.length; i++) {
			const cube = this.cubes[i];
			cube.p = [cube.resetPosition[0], cube.resetPosition[1]];
			cube.dots = [];
			cube.dotsLayer.removeChildren();
			this.getCell(cube.p).cubeId = i;
		}
		this.markComponents();
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
			const skipIndex = this.getCubeId(skip);
			if (skipIndex !== null) {
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
			neighbors.forEach(function(c) {
				if (c.cubeId) {
					queue.push(c.cubeId);
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
	 * Returns the bridge limit L.
	 */
	bridgeLimit(): number {
		const bounds = this.bounds();
		const width = bounds[2] - bounds[0] + 1;
		const height = bounds[3] - bounds[1] + 1;
		return 2 * (width + height);
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

	/**
	 * Colors the cubes by their connectivity, and set their connectivity
	 * fields.
	 */
	markComponents(): void {
		const [components, chunkIds] = this.findComponents();
		const stable = this.findCubeStability();
		for (let i = 0; i < this.cubes.length; i++) {
			if (components[i] === 2) {
				this.cubes[i].setComponentStatus(stable[i] ? ComponentStatus.CHUNK_STABLE : ComponentStatus.CHUNK_CUT);
			} else if (components[i] === 1) {
				this.cubes[i].setComponentStatus(stable[i] ? ComponentStatus.LINK_STABLE : ComponentStatus.LINK_CUT);
			} else if (components[i] === 3) {
				this.cubes[i].setComponentStatus(ComponentStatus.CONNECTOR);
			} else {
				this.cubes[i].setComponentStatus(ComponentStatus.NONE);
			}
			this.cubes[i].setChunkId(chunkIds[i]);
		}

		for (const c of this.cubes) {
			c.onBoundary = false;
		}

		for (const c of this.outsideCubes()) {
			c.onBoundary = true;
		}
	}

	/**
	 * Returns a list of component values for each cube.
	 *
	 * This returns two arrays. The first array indicates for each cube the
	 * component status: 1 and 2 mean that the cube is in a link or chunk,
	 * respectively, while 3 means that the cube is a connector (that is, in
	 * more than one component). The second array contains the ID of the chunk
	 * the cube is in. If the cube is a connector and in more than one chunk,
	 * the chunk ID of the chunk closer to the root is returned. Cubes that
	 * are not in a chunk get chunk ID -1.
	 *
	 * If the configuration is disconneted, this returns -1 for both component
	 * status and chunk IDs.
	 */
	findComponents(): [number[], number[]] {

		let components = Array(this.cubes.length).fill(-1);
		let chunkIds = Array(this.cubes.length).fill(-1);

		// don't try to find components if the configuration is disconnected
		if (!this.cubes.length || !this.isConnected()) {
			return [components, chunkIds];
		}

		let seen = Array(this.cubes.length).fill(false);
		const outside = this.outsideCubes();
		let stack = [];
		let chunksSeen = 0;

		// walk over the outside
		for (let i = 0; i < outside.length; i++) {
			const cube = outside[i];
			const cubeId = this.getCubeId(cube.p)!;

			// if we've not seen this cube, put it on the stack
			// else mark its component and pop it
			if (!seen[cubeId]) {
				seen[cubeId] = true;
				stack.push(cubeId);
			} else if (stack.length >= 1 && stack[stack.length - 2] === cubeId) {
				const cId = stack.pop()!;
				if (components[cId] === -1) {
					components[cId] = 1;
				}
				if (components[cubeId] === -1) {
					components[cubeId] = 1;
				}
			} else {
				// pop entire 2-component in one go
				while (stack.length > 1 && stack[stack.length - 1] !== cubeId) {
					const cId = stack.pop()!;
					components[cId] = components[cId] !== -1 ? 3 : 2;
					chunkIds[cId] = chunksSeen;
				}
				// mark attachment point as cross (except if stack is empty)
				const cId = stack[stack.length - 1];
				components[cId] = stack.length > 1 ? 3 : 2;
				chunkIds[cId] = chunksSeen;
				chunksSeen++;
			}
		}

		// if origin wasn't put in a component yet, it needs to be a
		// 1-component
		const originId = this.getCubeId(outside[0].p)!;
		if (components[originId] === -1) {
			components[originId] = 1;
		}

		// and all remaining cubes not in a component need to be on the inside
		// of a 2-component
		for (let i = 0; i < components.length; i++) {
			if (components[i] === -1) {
				components[i] = 2;
			}
		}

		// mark loose squares as part of a chunk
		for (let i = 0; i < components.length; i++) {
			if (components[i] === 1 &&
					this.degree(this.cubes[i]) === 1) {
				const neighbor = this.getOneNeighbor(this.cubes[i])!;
				const neighborIndex = this.getCubeId(neighbor.p)!;
				if (components[neighborIndex] === 3) {
					components[i] = 2;
					chunkIds[i] = chunkIds[neighborIndex];
					const [x, y] = neighbor.p;
					let cs = [
						this.getCube([x - 1, y]),
						this.getCube([x + 1, y]),
						this.getCube([x, y - 1]),
						this.getCube([x, y + 1])
					];
					let shouldRemoveConnector = true;
					for (let c of cs) {
						if (c) {
							if (components[this.getCubeId(c.p)!] === 1) {
								shouldRemoveConnector = false;
							}
						}
					}
					if (shouldRemoveConnector) {
						components[this.getCubeId(neighbor.p)!] = 2;
					}
				}
			}
		}

		return [components, chunkIds];
	}

	/**
	 * Determines which cubes in the configuration are stable.
	 *
	 * Returns a list of booleans for each cube: true if the corresponding cube
	 * is stable; false if it is a cut cube.
	 */
	findCubeStability(): boolean[] {
		if (!this.cubes.length) {
			return [];
		}
		let seen = Array(this.cubes.length).fill(false);
		let parent: (number | null)[] = Array(this.cubes.length).fill(null);
		let depth = Array(this.cubes.length).fill(-1);
		let low = Array(this.cubes.length).fill(-1);
		let stable = Array(this.cubes.length).fill(true);
		this.findCubeStabilityRecursive(0, 0, seen, parent, depth, low, stable);
		return stable;
	}

	private findCubeStabilityRecursive(i: number, d: number,
			seen: boolean[], parent: (number | null)[],
			depth: number[], low: number[],
			stable: boolean[]): void {

		seen[i] = true;
		depth[i] = d;
		low[i] = d;
		let cube = this.cubes[i];

		const neighbors = [
			this.getCell([cube.p[0] - 1, cube.p[1]]),
			this.getCell([cube.p[0] + 1, cube.p[1]]),
			this.getCell([cube.p[0], cube.p[1] - 1]),
			this.getCell([cube.p[0], cube.p[1] + 1])
		];
		const self = this;
		let cutCube = false;
		let childCount = 0;
		neighbors.forEach(function(c) {
			if (c.cubeId !== null && !seen[c.cubeId]) {
				parent[c.cubeId] = i;
				self.findCubeStabilityRecursive(c.cubeId, d + 1,
						seen, parent, depth, low, stable);
				childCount++;
				if (low[c.cubeId] >= depth[i]) {
					cutCube = true;
				}
				low[i] = Math.min(low[i], low[c.cubeId]);
			} else if (c.cubeId !== null && c.cubeId != parent[i]) {
				low[i] = Math.min(low[i], depth[c.cubeId]);
			}
		});
		if (parent[i] === null) {
			stable[i] = childCount <= 1;
		} else {
			stable[i] = !cutCube;
		}
	}

	/**
	 * Generates the component tree.
	 */
	makeComponentTree(): ComponentTree | null {

		// don't try to find components if the configuration is disconnected
		if (!this.isConnected()) {
			return null;
		}

		let seen = Array(this.cubes.length).fill(false);
		const outside = this.outsideCubes();
		let stack = [];

		// walk over the outside
		const origin = outside[0];
		let trees: ComponentTree[] = [];
		let newBranch = false;
		for (let i = 0; i < outside.length; i++) {
			const cube = outside[i];
			const cubeId = this.getCubeId(cube.p)!;

			// if we've not seen this cube, put it on the stack
			// else mark its component and pop it
			if (!seen[cubeId]) {
				seen[cubeId] = true;
				stack.push(cubeId);
				if (cube.componentStatus !== ComponentStatus.CHUNK_STABLE && cube.componentStatus !== ComponentStatus.CHUNK_CUT) {
					newBranch = true;
				}
			} else if (stack.length >= 1 && stack[stack.length - 2] === cubeId) {
				let cId = stack.pop()!;

				let tree = new ComponentTree(1);
				if (newBranch) {
					trees.push(tree);
					newBranch = false;
				} else {
					tree.children = trees;
					trees = [tree];
				}
				tree.outsideCubes.push(this.cubes[cId]);
				tree.outsideCubes.push(this.cubes[cubeId]);
			} else {
				// pop entire 2-component in one go
				let tree = new ComponentTree(2);

				if (newBranch) {
					trees.push(tree);
					newBranch = false;
				} else {
					tree.children = trees;
					trees = [tree];
				}

				while (stack.length > 1 && stack[stack.length - 1] !== cubeId) {
					let cId = stack.pop()!;
					//components[cId] = components[cId] !== -1 ? 3 : 2;
					tree.outsideCubes.push(this.cubes[cId]);
				}
				tree.outsideCubes.push(this.cubes[stack[stack.length - 1]]);

				// TODO need to do this to find triple crosses
				/*if (stack.length > 1) {
					let oneTree = new ComponentTree(1);
					oneTree.children = [tree];
					oneTree.outsideCubes.push(this.cubes[stack[stack.length - 1]]);
					trees = [oneTree];
				}*/
			}
		}

		return trees[0]!;
	}

	/**
	 * Finds a leaf component in the component tree.
	 *
	 * Returns the attachment point of the leaf component or null if the
	 * component tree consists of only a single node.
	 */
	findLeaf(): [Cube, number] | null {

		let seen = Array(this.cubes.length).fill(false);
		let outside = this.outsideCubes();
		let stack = [];

		// walk over the outside
		for (let i = 0; i < outside.length; i++) {
			const cube = outside[i];
			const cubeId = this.getCubeId(cube.p)!;

			if (!seen[cubeId]) {
				seen[cubeId] = true;
				stack.push(cubeId);
			} else if (stack.length >= 1 && stack[stack.length - 2] === cubeId) {
				return [cube, 1];
			} else {
				return [cube, 2];
			}
		}

		return null;
	}

	/**
	 * Finds the empty space that we are going to slime to from the given
	 * leaf.
	 */
	findSlimeTarget(leaf: Cube): Cube {
		return this.getCube([0, 0])!;
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
		const has = this.hasNeighbors(p);
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
	 * Given a cube, determines the number of cubes in its descendant(s).
	 */
	bridgeCapacity(b: Cube): number {

		// do a BFS from the root, but ignore b
		let seen = Array(this.cubes.length).fill(false);
		const bId = this.getCubeId(b.p)!;
		seen[bId] = true;
		let cubeCount = 1;

		const originId = this.getCubeId(this.downmostLeftmost()!.p);
		let queue = [originId];

		while (queue.length !== 0) {
			const cubeId = queue.shift()!;
			if (seen[cubeId]) {
				continue;
			}

			const cube = this.cubes[cubeId];
			seen[cubeId] = true;
			if (bId !== cubeId) {
				cubeCount++;
			}

			const neighbors = [
				this.getCell([cube.p[0] - 1, cube.p[1]]),
				this.getCell([cube.p[0] + 1, cube.p[1]]),
				this.getCell([cube.p[0], cube.p[1] - 1]),
				this.getCell([cube.p[0], cube.p[1] + 1])
			];
			neighbors.forEach(function(c) {
				if (c.cubeId !== null) {
					queue.push(c.cubeId);
				}
			});
		}

		return this.cubes.length - cubeCount;
	}

	/**
	 * Returns the shortest path in the 4-adjacency graph between the given
	 * source and target cubes.
	 */
	shortestCubePath(from: Cube, to: Cube): Cube[] {

		// do a BFS
		let seen = Array(this.cubes.length).fill(false);
		let parent: (Cube | null)[] = Array(this.cubes.length).fill(null);
		let queue: [number, Cube | null][] = [[this.getCubeId(from.p)!, null]];

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
			neighbors.forEach(function(c) {
				if (c.cubeId) {
					queue.push([c.cubeId, cube]);
				}
			});
		}

		// reconstruct the path
		let cube = to;
		let path = [to];
		while (cube.p[0] !== from.p[0] || cube.p[1] !== from.p[1]) {
			cube = parent[this.getCubeId(cube.p)!]!;
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
	 * Determines if the configuration is xy-monotone.
	 */
	isXYMonotone(): boolean {
		const [minX, minY, , ] = this.bounds();

		for (const cube of this.cubes) {
			if (cube.p[0] === minX || cube.p[1] === minY) {
				continue;
			}
			if (!this.hasCube([cube.p[0], cube.p[1] - 1])) {
				return false;
			}
			if (!this.hasCube([cube.p[0] - 1, cube.p[1]])) {
				return false;
			}
		}

		return true;
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
				case ComponentStatus.CHUNK_STABLE:
					elements += `<use layer="cubes" name="mark/square(sx)" pos="${x + 4} ${y + 4}" size="normal" stroke="Bettina blue"/>\n`;
					break;
				case ComponentStatus.LINK_STABLE:
					elements += `<use layer="cubes" name="mark/disk(sx)" pos="${x + 4} ${y + 4}" size="normal" stroke="Bettina red"/>\n`;
					break;
				case ComponentStatus.CHUNK_CUT:
					elements += `<use layer="cubes" name="mark/box(sx)" pos="${x + 4} ${y + 4}" size="normal" stroke="Bettina blue"/>\n`;
					break;
				case ComponentStatus.LINK_CUT:
					elements += `<use layer="cubes" name="mark/circle(sx)" pos="${x + 4} ${y + 4}" size="normal" stroke="Bettina red"/>\n`;
					break;
				case ComponentStatus.CONNECTOR:
					elements += `<use layer="cubes" name="mark/box(sx)" pos="${x + 4} ${y + 4}" size="normal" stroke="Bettina blue"/>\n`;
					elements += `<use layer="cubes" name="mark/cross(sx)" pos="${x + 4} ${y + 4}" size="normal" stroke="Bettina blue"/>\n`;
					break;
			}
		});
		
		return header + elements + footer;
	}
}

export {Algorithm, World, Move, MoveDirection};

