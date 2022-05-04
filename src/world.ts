import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';

import { Color, ComponentStatus, Square } from './square';

type WorldCell = {
	squareId: number | null;
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
 * Representation of a single square move (either slide or corner).
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
		if (this.world.getSquare(this.targetPosition())) {
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
				// for corner moves, need to ensure that there is no square in
				// the first direction (which would be in our way) and there
				// is a square in the second direction (that we can pivot along)
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
	 * Computes coordinates of a square executing this move at the given time
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
		const square = this.world.getSquare(this.position);
		if (!square) {
			throw new Error(`Tried to move non-existing square ` +
				`at (${this.position[0]}, ${this.position[1]})`);
		}

		this.world.moveSquare(square, this.targetPosition());
	}

	toString(): string {
		const from = this.position;
		const to = this.targetPosition();
		return `(${from[0]}, ${from[1]}) \u2192 (${to[0]}, ${to[1]})`;
	}
}

/**
 * Collection of squares on the grid.
 */
class World {

	world: WorldCell[][] = [];

	viewport = new Viewport();

	pixi = new PIXI.Container();
	backgroundPixi = new PIXI.Container();
	foregroundPixi = new PIXI.Container();
	gridPixi = new PIXI.Container();
	treePixi = new PIXI.Graphics();
	grid: PIXI.Mesh;

	squares: Square[] = [];

	currentMove: Move | null = null;

	showComponentMarks = false;

	/**
	 * Creates the world and initializes its PIXI elements (viewport and grid).
	 */
	constructor() {
		const container = document.getElementById('squares-simulator-container')!;

		this.viewport = new Viewport({
			'divWheel': container
		});
		this.viewport.addChild(this.gridPixi);
		this.viewport.addChild(this.backgroundPixi);

		this.backgroundPixi.filters = [new PIXI.filters.AlphaFilter(0.3)];
		this.viewport.addChild(this.pixi);

		this.viewport.addChild(this.foregroundPixi);

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
				squareId: null
			};
		}
		return column[y];
	}

	/**
	 * Returns the ID of the square at the given location, or null if that cell is empty.
	 */
	getSquareId(p: [number, number]): number | null {
		return this.getCell(p).squareId;
	}

	/**
	 * Returns the square at the given location, or null if that cell is empty.
	 */
	getSquare(p: [number, number]): Square | null {
		const id = this.getSquareId(p);
		if (id === null) {
			return null;
		}
		return this.squares[id];
	}

	/**
	 * Checks if a square exists at the given location.
	 */
	hasSquare(p: [number, number]): boolean {
		return !!this.getSquare(p);
	}

	/**
	 * Adds a square to the world; throws if a square already exists at that
	 * location.
	 */
	addSquare(square: Square): void {
		this.addSquareUnmarked(square);
		this.markComponents();
	}

	/**
	 * As addSquare(), but does not update the component status of the squares.
	 */
	addSquareUnmarked(square: Square): void {
		if (this.hasSquare(square.p)) {
			throw new Error(`Tried to insert square on top of another square ` +
				`at (${square.p[0]}, ${square.p[1]})`);
		}
		this.getCell(square.p).squareId = this.squares.length;
		this.squares.push(square);
		this.pixi.addChild(square.pixi);
		this.backgroundPixi.addChild(square.backgroundPixi);
		this.foregroundPixi.addChild(square.foregroundPixi);
	}

	/**
	 * Moves the given square from its current location to the given target
	 * location. Throws if a square already exists at the target.
	 */
	moveSquare(square: Square, to: [number, number]): void {
		this.moveSquareUnmarked(square, to);
		this.markComponents();
	}

	/**
	 * As moveSquare(), but does not update the component status of the squares.
	 */
	moveSquareUnmarked(square: Square, to: [number, number]): void {
		if (this.hasSquare(to)) {
			throw new Error(`Tried to move square on top of another square ` +
				`at (${to[0]}, ${to[1]})`);
		}

		const id = this.getSquareId(square.p)!;
		this.getCell(square.p).squareId = null;
		this.getCell(to).squareId = id;
		square.p = [to[0], to[1]];
		square.updatePosition(0, 0);
	}

	/**
	 * Removes the square at the given location.
	 */
	removeSquare(square: Square): void {
		this.removeSquareUnmarked(square);
		this.markComponents();
	}

	/**
	 * As removeSquare(), but does not update the component status of the squares.
	 */
	removeSquareUnmarked(square: Square): void {
		this.getCell(square.p).squareId = null;
		this.pixi.removeChild(square.pixi);
		this.backgroundPixi.removeChild(square.backgroundPixi);
		this.foregroundPixi.removeChild(square.foregroundPixi);
		this.squares = this.squares.filter((b) => b !== square);
		// because removing the square from this.squares changes the indices, we
		// need to update the squareIds as well
		for (let i = 0; i < this.squares.length; i++) {
			this.getCell(this.squares[i].p).squareId = i;
		}
	}

	/**
	 * Updates the positions of all squares in the visualization.
	 */
	updatePositions(time: number, timeStep: number): void {
		this.squares.forEach((square) => {
			square.updatePosition(time, timeStep);
		});
		if (this.currentMove) {
			const p = this.currentMove.position;
			this.getSquare(p)?.updatePosition(time, timeStep, this.currentMove);
		}
	}

	/**
	 * Puts all squares back in their starting location.
	 */
	reset(): void {
		this.squares.forEach((square) => {
			this.getCell(square.p).squareId = null;
		});
		for (let i = 0; i < this.squares.length; i++) {
			const square = this.squares[i];
			square.p = [square.resetPosition[0], square.resetPosition[1]];
			square.dots = [];
			this.getCell(square.p).squareId = i;
		}
		this.currentMove = null;
		this.markComponents();
	}

	/**
	 * Returns an object with keys 'N', 'NE', 'E', etc. with booleans
	 * indicating if the given cell has neighboring squares in that direction.
	 */
	hasNeighbors(p: [number, number]): { [key: string]: boolean } {
		const [x, y] = p;
		let has: { [key: string]: boolean } = {};
		has['N'] = this.hasSquare([x, y + 1]);
		has['NE'] = this.hasSquare([x + 1, y + 1]);
		has['E'] = this.hasSquare([x + 1, y]);
		has['SE'] = this.hasSquare([x + 1, y - 1]);
		has['S'] = this.hasSquare([x, y - 1]);
		has['SW'] = this.hasSquare([x - 1, y - 1]);
		has['W'] = this.hasSquare([x - 1, y]);
		has['NW'] = this.hasSquare([x - 1, y + 1]);
		return has;
	}

	/**
	 * Given a square, returns a list of all the moves starting at that square that
	 * are valid.
	 *
	 * If the configuration would be disconnected without the given square, no
	 * move is valid, so an empty array is returned.
	 */
	validMovesFrom(p: [number, number]): Move[] {
		let moves: Move[] = [];

		if (!this.isConnected(p)) {
			return [];
		}

		for (const direction of Object.keys(MoveDirection)) {
			const m = new Move(this, p, MoveDirection[<MoveDirection>direction]);
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
	getMoveTo(source: Square, target: [number, number]): Move | null {
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
	 * Executes the shortest move path between the given squares.
	 *
	 * Throws if no move path is possible.
	 *
	 * @param from The source coordinate, containing the square we want to move.
	 * @param to The target coordinate, which should be an empty cell.
	 */
	*shortestMovePath(from: [number, number], to: [number, number]): Algorithm {

		// temporarily remove the origin square from the configuration, to avoid
		// invalid moves in the resulting move path (because we could slide
		// along the origin square itself)
		const square = this.getSquare(from);
		if (square === null) {
			throw "Cannot compute move path from non-existing square" +
			` (${from[0]}, ${from[1]})`;
		}
		this.removeSquareUnmarked(square);

		// do BFS over the move graph
		let seen: { [key: string]: { 'seen': boolean, 'move': Move | null } } = {};
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

			const moves = this.validMovesFrom(location[0]);
			moves.forEach(function (move) {
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

		// put the origin square back
		this.addSquare(square);

		yield* path;
	}

	/**
	 * Finds all loose squares (1-components with consisting of only a single
	 * square) and returns them in order around the boundary of the
	 * configuration.
	 */
	findLooseSquares(): Square[] {
		let looseSquares: Square[] = [];

		const outside = this.outsideSquares();
		for (let i = 1; i < outside.length - 1; i++) {
			if (outside[i - 1] === outside[i + 1] &&
				outside[i - 1].componentStatus === ComponentStatus.CONNECTOR) {
				looseSquares.push(outside[i]);
			}
		}
		if (outside.length > 1 &&
			outside[outside.length - 2] === outside[1] &&
			outside[1].componentStatus === ComponentStatus.CONNECTOR) {
			looseSquares.push(outside[0]);
		}

		return looseSquares;
	}

	/**
	 * Given two loose squares, move the first loose square to be adjacent to the
	 * second one, so that they are both not loose squares anymore.
	 */
	*mergeLooseSquares(c1: Square, c2: Square): Algorithm {
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
	 * Checks if the column with the given x-coordinate does not contain any
	 * squares.
	 */
	columnEmpty(x: number): boolean {
		for (let square of this.squares) {
			if (square.p[0] === x) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Checks if the row with the given y-coordinate does not contain any
	 * squares.
	 */
	rowEmpty(y: number): boolean {
		for (let square of this.squares) {
			if (square.p[1] === y) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Returns the degree of the given square (in 4-connectivity).
	 */
	degree(square: Square): number {
		const has = this.hasNeighbors(square.p);
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
	 * Returns a neighbor of the given square.
	 */
	getOneNeighbor(square: Square): Square | null {
		const [x, y] = square.p;
		let neighbor = this.getSquare([x + 1, y]);
		if (neighbor) {
			return neighbor;
		}
		neighbor = this.getSquare([x - 1, y]);
		if (neighbor) {
			return neighbor;
		}
		neighbor = this.getSquare([x, y + 1]);
		if (neighbor) {
			return neighbor;
		}
		neighbor = this.getSquare([x, y - 1]);
		if (neighbor) {
			return neighbor;
		}
		return null;
	}

	/**
	 * Returns all neighbors of the given grid coordinate.
	 */
	getNeighbors([x, y]: [number, number]): Square[] {
		let neighbors = [];
		let neighbor = this.getSquare([x + 1, y]);
		if (neighbor) {
			neighbors.push(neighbor);
		}
		neighbor = this.getSquare([x - 1, y]);
		if (neighbor) {
			neighbors.push(neighbor);
		}
		neighbor = this.getSquare([x, y + 1]);
		if (neighbor) {
			neighbors.push(neighbor);
		}
		neighbor = this.getSquare([x, y - 1]);
		if (neighbor) {
			neighbors.push(neighbor);
		}
		return neighbors;
	}

	/**
	 * Returns all neighbors of the given grid coordinate, as a dictionary
	 * mapping compass directions to Squares.
	 */
	getNeighborMap([x, y]: [number, number]): { [direction: string]: Square | null } {
		let neighbors: { [direction: string]: Square | null } = {};
		neighbors['N'] = this.getSquare([x, y + 1]);
		neighbors['E'] = this.getSquare([x + 1, y]);
		neighbors['W'] = this.getSquare([x - 1, y]);
		neighbors['S'] = this.getSquare([x, y - 1]);
		neighbors['NE'] = this.getSquare([x + 1, y + 1]);
		neighbors['NW'] = this.getSquare([x - 1, y + 1]);
		neighbors['SW'] = this.getSquare([x - 1, y - 1]);
		neighbors['SE'] = this.getSquare([x + 1, y - 1]);
		return neighbors;
	}

	/**
	 * Checks if the configuration is connected. If the skip parameter is
	 * provided, that square is ignored (considered as non-existing).
	 */
	isConnected(skip?: [number, number]): boolean {
		if (!this.squares.length) {
			return true;
		}

		// do BFS from square 0 to check if we can reach all squares
		let seen = Array(this.squares.length).fill(false);
		let seenCount = 0;
		let queue = [0];

		if (skip) {
			// mark the skipped square so we won't visit it again
			const skipIndex = this.getSquareId(skip);
			if (skipIndex !== null) {
				seen[skipIndex] = true;
				seenCount++;

				// special case: if we were about to start our BFS with the
				// skipped square, then pick another square to start with
				// (note that if the configuration has exactly 1 square, which
				// is then skipped, the function should return true
				// but that works because the BFS starting at the skipped
				// square will not encounter any squares)
				if (skipIndex === 0 && this.squares.length > 1) {
					queue = [1];
				}
			}
		}

		while (queue.length !== 0) {
			const squareId = queue.shift()!;
			if (seen[squareId]) {
				continue;
			}

			const square = this.squares[squareId];
			seen[squareId] = true;
			seenCount++;

			const neighbors = [
				this.getCell([square.p[0] - 1, square.p[1]]),
				this.getCell([square.p[0] + 1, square.p[1]]),
				this.getCell([square.p[0], square.p[1] - 1]),
				this.getCell([square.p[0], square.p[1] + 1])
			];
			neighbors.forEach(function (c) {
				if (c.squareId) {
					queue.push(c.squareId);
				}
			});
		}

		return this.squares.length === seenCount;
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
		let seen: { [key: string]: boolean } = {};
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
			neighbors.forEach(function (c) {
				if (!self.hasSquare(c)) {
					queue.push(c);
				}
			});
		}

		return true;
	}

	/**
	 * Returns the minimum and maximum x- and y-coordinates of squares in the
	 * configuration, as an array [minX, minY, maxX, maxY].
	 */
	bounds(): [number, number, number, number] {
		return [
			this.squares.map((square) => square.p[0]).min(),
			this.squares.map((square) => square.p[1]).min(),
			this.squares.map((square) => square.p[0]).max(),
			this.squares.map((square) => square.p[1]).max()
		];
	}

	/**
	 * Returns the length of the perimeter of the bounding box.
	 */
	boundingBoxPerimeterLength(): number {
		const bounds = this.bounds();
		const width = bounds[2] - bounds[0] + 1;
		const height = bounds[3] - bounds[1] + 1;
		return 2 * (width + height);
	}

	/**
	 * Returns the leftmost square in the downmost row that contains squares.
	 */
	downmostLeftmost(): Square | null {
		if (!this.squares.length) {
			return null;
		}

		const lowestY = this.squares
			.map((square) => square.p[1])
			.min();

		const lowestX = this.squares
			.filter((square) => square.p[1] === lowestY)
			.map((square) => square.p[0])
			.min();

		return this.getSquare([lowestX, lowestY]);
	}

	/**
	 * Colors the squares by their connectivity, and set their connectivity
	 * fields.
	 */
	markComponents(): void {
		const [components, chunkIds] = this.findComponents();
		const stable = this.findSquareStability();
		for (let i = 0; i < this.squares.length; i++) {
			if (components[i] === 2) {
				this.squares[i].setComponentStatus(stable[i] ? ComponentStatus.CHUNK_STABLE : ComponentStatus.CHUNK_CUT);
			} else if (components[i] === 1) {
				this.squares[i].setComponentStatus(stable[i] ? ComponentStatus.LINK_STABLE : ComponentStatus.LINK_CUT);
			} else if (components[i] === 3) {
				this.squares[i].setComponentStatus(ComponentStatus.CONNECTOR);
			} else {
				this.squares[i].setComponentStatus(ComponentStatus.NONE);
			}
			this.squares[i].setChunkId(chunkIds[i]);
		}

		for (const c of this.squares) {
			c.onBoundary = false;
		}

		for (const c of this.outsideSquares()) {
			c.onBoundary = true;
		}
	}

	/**
	 * Returns a list of component values for each square.
	 *
	 * This returns two arrays. The first array indicates for each square the
	 * component status: 1 and 2 mean that the square is in a link or chunk,
	 * respectively, while 3 means that the square is a connector (that is, in
	 * more than one component). The second array contains the ID of the chunk
	 * the square is in. If the square is a connector and in more than one chunk,
	 * the chunk ID of the chunk closer to the root is returned. Squares that
	 * are not in a chunk get chunk ID -1.
	 *
	 * If the configuration is disconnected, this returns -1 for both component
	 * status and chunk IDs.
	 */
	findComponents(): [number[], number[]] {

		let components = Array(this.squares.length).fill(-1);
		let chunkIds = Array(this.squares.length).fill(-1);

		// don't try to find components if the configuration is disconnected
		if (!this.squares.length || !this.isConnected()) {
			return [components, chunkIds];
		}

		let seen = Array(this.squares.length).fill(false);
		const outside = this.outsideSquares();
		let stack = [];
		let chunksSeen = 0;

		// walk over the outside
		for (let i = 0; i < outside.length; i++) {
			const square = outside[i];
			const squareId = this.getSquareId(square.p)!;

			// if we've not seen this square, put it on the stack
			// else mark its component and pop it
			if (!seen[squareId]) {
				seen[squareId] = true;
				stack.push(squareId);
			} else if (stack.length >= 1 && stack[stack.length - 2] === squareId) {
				const cId = stack.pop()!;
				if (components[cId] === -1) {
					components[cId] = 1;
				}
				if (components[squareId] === -1) {
					components[squareId] = 1;
				}
			} else {
				// pop entire 2-component in one go
				while (stack.length > 1 && stack[stack.length - 1] !== squareId) {
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
		const originId = this.getSquareId(outside[0].p)!;
		if (components[originId] === -1) {
			components[originId] = 1;
		}

		// and all remaining squares not in a component need to be on the inside
		// of a 2-component
		for (let i = 0; i < components.length; i++) {
			if (components[i] === -1) {
				components[i] = 2;
			}
		}

		// mark loose squares as part of a chunk
		for (let i = 0; i < components.length; i++) {
			if (components[i] === 1 &&
				this.degree(this.squares[i]) === 1) {
				const neighbor = this.getOneNeighbor(this.squares[i])!;
				const neighborIndex = this.getSquareId(neighbor.p)!;
				if (components[neighborIndex] === 3) {
					components[i] = 2;
					chunkIds[i] = chunkIds[neighborIndex];
					const [x, y] = neighbor.p;
					let cs = [
						this.getSquare([x - 1, y]),
						this.getSquare([x + 1, y]),
						this.getSquare([x, y - 1]),
						this.getSquare([x, y + 1])
					];
					let shouldRemoveConnector = true;
					for (let c of cs) {
						if (c) {
							if (components[this.getSquareId(c.p)!] === 1) {
								shouldRemoveConnector = false;
							}
						}
					}
					if (shouldRemoveConnector) {
						components[this.getSquareId(neighbor.p)!] = 2;
					}
				}
			}
		}

		return [components, chunkIds];
	}

	/**
	 * Determines which squares in the configuration are stable.
	 *
	 * Returns a list of booleans for each square: true if the corresponding square
	 * is stable; false if it is a cut square.
	 */
	findSquareStability(): boolean[] {
		if (!this.squares.length) {
			return [];
		}
		let seen = Array(this.squares.length).fill(false);
		let parent: (number | null)[] = Array(this.squares.length).fill(null);
		let depth = Array(this.squares.length).fill(-1);
		let low = Array(this.squares.length).fill(-1);
		let stable = Array(this.squares.length).fill(true);
		this.findSquareStabilityRecursive(0, 0, seen, parent, depth, low, stable);
		return stable;
	}

	private findSquareStabilityRecursive(i: number, d: number,
		seen: boolean[], parent: (number | null)[],
		depth: number[], low: number[],
		stable: boolean[]): void {

		seen[i] = true;
		depth[i] = d;
		low[i] = d;
		let square = this.squares[i];

		const neighbors = [
			this.getCell([square.p[0] - 1, square.p[1]]),
			this.getCell([square.p[0] + 1, square.p[1]]),
			this.getCell([square.p[0], square.p[1] - 1]),
			this.getCell([square.p[0], square.p[1] + 1])
		];
		const self = this;
		let cutSquare = false;
		let childCount = 0;
		neighbors.forEach(function (c) {
			if (c.squareId !== null && !seen[c.squareId]) {
				parent[c.squareId] = i;
				self.findSquareStabilityRecursive(c.squareId, d + 1,
					seen, parent, depth, low, stable);
				childCount++;
				if (low[c.squareId] >= depth[i]) {
					cutSquare = true;
				}
				low[i] = Math.min(low[i], low[c.squareId]);
			} else if (c.squareId !== null && c.squareId != parent[i]) {
				low[i] = Math.min(low[i], depth[c.squareId]);
			}
		});
		if (parent[i] === null) {
			stable[i] = childCount <= 1;
		} else {
			stable[i] = !cutSquare;
		}
	}

	/**
	 * Finds a leaf component in the component tree.
	 *
	 * Returns the attachment point of the leaf component or null if the
	 * component tree consists of only a single node.
	 */
	findLeaf(): [Square, number] | null {

		let seen = Array(this.squares.length).fill(false);
		let outside = this.outsideSquares();
		let stack = [];

		// walk over the outside
		for (let i = 0; i < outside.length; i++) {
			const square = outside[i];
			const squareId = this.getSquareId(square.p)!;

			if (!seen[squareId]) {
				seen[squareId] = true;
				stack.push(squareId);
			} else if (stack.length >= 1 && stack[stack.length - 2] === squareId) {
				return [square, 1];
			} else {
				return [square, 2];
			}
		}

		return null;
	}

	/**
	 * Returns a list of squares on the outside of the configuration, in
	 * counter-clockwise order, starting with the downmost-leftmost square.
	 * The downmost-leftmost square is included twice (both as the first and as
	 * the last element in the list).
	 */
	outsideSquares(): Square[] {
		if (!this.squares.length) {
			return [];
		}
		const start = this.downmostLeftmost()!;
		let outside: Square[] = [];
		let edgesSeen = new Set();
		let position: [number, number] = [start.p[0], start.p[1]];
		let direction: string | null = 'S';
		while (true) {
			let square = this.getSquare(position)!;
			outside.push(square);
			direction = this.nextOnOutside(position, direction);
			if (!direction) {
				break;
			}
			let newEdge = square.p[0] + " " + square.p[1] + " " + direction;
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
		const bends: { [key: string]: string[] } = {
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
	 * Given a square, determines the number of squares in its descendant(s).
	 */
	capacity(b: Square): number {

		// do a BFS from the root, but ignore b
		let seen = Array(this.squares.length).fill(false);
		const bId = this.getSquareId(b.p)!;
		seen[bId] = true;
		let squareCount = 1;

		const originId = this.getSquareId(this.downmostLeftmost()!.p);
		let queue = [originId];

		while (queue.length !== 0) {
			const squareId = queue.shift()!;
			if (seen[squareId]) {
				continue;
			}

			const square = this.squares[squareId];
			seen[squareId] = true;
			if (bId !== squareId) {
				squareCount++;
			}

			const neighbors = [
				this.getCell([square.p[0] - 1, square.p[1]]),
				this.getCell([square.p[0] + 1, square.p[1]]),
				this.getCell([square.p[0], square.p[1] - 1]),
				this.getCell([square.p[0], square.p[1] + 1])
			];
			neighbors.forEach(function (c) {
				if (c.squareId !== null) {
					queue.push(c.squareId);
				}
			});
		}

		return this.squares.length - squareCount;
	}

	/**
	 * Determines if the configuration is xy-monotone.
	 */
	isXYMonotone(): boolean {
		const [minX, minY, ,] = this.bounds();

		for (const square of this.squares) {
			if (square.p[0] !== minX &&
				!this.hasSquare([square.p[0] - 1, square.p[1]])) {
				return false;
			}
			if (square.p[1] !== minY &&
				!this.hasSquare([square.p[0], square.p[1] - 1])) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Generates a JSON string from this world.
	 */
	serialize(): string {
		let squares: any = [];
		this.squares.forEach((square) => {
			squares.push({
				'x': square.resetPosition[0],
				'y': square.resetPosition[1],
				'color': [square.color.r, square.color.g, square.color.b]
			});
		});
		let obj: any = {
			'_version': 2,
			'squares': squares
		};
		return JSON.stringify(obj);
	}

	/**
	 * Parses a JSON string back into this world. Make sure this is an empty
	 * world before calling this method.
	 */
	deserialize(data: string): void {
		let obj: any = JSON.parse(data);

		const version = obj['_version'];
		if (version > 2) {
			throw new Error('Save file with incorrect version');
		}

		let squares: any[] = obj[version === 1 ? 'cubes' : 'squares'];
		squares.forEach((square: any) => {
			let color = Color.BLUE;
			if (square.hasOwnProperty('color')) {
				color = new Color(square['color'][0],
					square['color'][1], square['color'][2]);
			}
			this.addSquare(new Square(this, [square['x'], square['y']], color));
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
		this.squares.forEach((square) => {
			let x = 8 * square.p[0];
			let y = 8 * square.p[1];
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

		// squares
		this.squares.forEach((square) => {
			let x = 8 * square.p[0];
			let y = 8 * square.p[1];
			elements += `<path stroke="black" fill="Gray 0.9" pen="heavier" cap="1" join="1">
${x} ${y + 8} m
${x} ${y} l
${x + 8} ${y} l
${x + 8} ${y + 8} l
h
</path>\n`;

			switch (square.componentStatus) {
				case ComponentStatus.CHUNK_STABLE:
					elements += `<use layer="squares" name="mark/square(sx)" pos="${x + 4} ${y + 4}" size="normal" stroke="Bettina blue"/>\n`;
					break;
				case ComponentStatus.LINK_STABLE:
					elements += `<use layer="squares" name="mark/disk(sx)" pos="${x + 4} ${y + 4}" size="normal" stroke="Bettina red"/>\n`;
					break;
				case ComponentStatus.CHUNK_CUT:
					elements += `<use layer="squares" name="mark/box(sx)" pos="${x + 4} ${y + 4}" size="normal" stroke="Bettina blue"/>\n`;
					break;
				case ComponentStatus.LINK_CUT:
					elements += `<use layer="squares" name="mark/circle(sx)" pos="${x + 4} ${y + 4}" size="normal" stroke="Bettina red"/>\n`;
					break;
				case ComponentStatus.CONNECTOR:
					elements += `<use layer="squares" name="mark/box(sx)" pos="${x + 4} ${y + 4}" size="normal" stroke="Bettina blue"/>\n`;
					elements += `<use layer="squares" name="mark/cross(sx)" pos="${x + 4} ${y + 4}" size="normal" stroke="Bettina blue"/>\n`;
					break;
			}
		});

		return header + elements + footer;
	}
}

export { Algorithm, World, Move, MoveDirection };
