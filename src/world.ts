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
 * Representation of the component tree.
 */
class ComponentTree {
	componentType: number;
	outsideSquares: Square[] = [];
	children: ComponentTree[] = [];

	constructor(componentType: number) {
		this.componentType = componentType;
	}

	centerOfMass(): [number, number] {
		let n = this.outsideSquares.length;
		if (n === 0) {
			return [0, 0];
		}
		let xSum = 0, ySum = 0;
		for (let square of this.outsideSquares) {
			xSum += square.p[0];
			ySum += square.p[1];
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
 * Collection of squares on the grid.
 */
class World {

	world: WorldCell[][] = [];

	viewport = new Viewport();
	pixi = new PIXI.Container();
	backgroundPixi = new PIXI.Container();
	gridPixi = new PIXI.Container();
	treePixi = new PIXI.Graphics();
	grid: PIXI.Mesh;

	squares: Square[] = [];

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
		this.squares = this.squares.filter((b) => b !== square);
		// because removing the square from this.squares changes the indices, we
		// need to update the squareIds as well
		for (let i = 0; i < this.squares.length; i++) {
			this.getCell(this.squares[i].p).squareId = i;
		}
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

			const moves = this.validMovesFrom(location[0]); // FIXME this allows moves that use the from square...
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
	 * Finds all parity squares (1-components with consisting of only a single
	 * square) and returns them in order around the boundary of the
	 * configuration.
	 */
	findParitySquares(): Square[] {
		let paritySquares: Square[] = [];

		const outside = this.outsideSquares();
		for (let i = 1; i < outside.length - 1; i++) {
			if (outside[i - 1] === outside[i + 1] &&
				outside[i - 1].componentStatus === ComponentStatus.CONNECTOR) {
				paritySquares.push(outside[i]);
			}
		}
		if (outside.length > 1 &&
			outside[outside.length - 2] === outside[1] &&
			outside[1].componentStatus === ComponentStatus.CONNECTOR) {
			paritySquares.push(outside[0]);
		}

		return paritySquares;
	}

	/**
	 * Given two parity squares, move the first parity square to be adjacent to the
	 * second one, so that they are both not parity squares anymore.
	 */
	*mergeParitySquares(c1: Square, c2: Square): Algorithm {
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
		if (!this.hasSquare([0, 0])) {
			return false;
		}
		let originId = this.getSquareId([0, 0]);

		// check if the boundary is all part of a 2-component
		// TODO!!!!

		// check if we don't contain gaps
		let gaps = this.gaps();
		if (gaps.length) {
			return false;
		}

		// check monotonicity by running BFS to top-right, counting the
		// number of squares found, and checking if this is equal to total
		// number of squares
		let seen = Array(this.squares.length).fill(false);
		let seenCount = 0;
		let queue = [originId];

		while (queue.length !== 0) {
			const squareId = queue.shift()!;
			if (seen[squareId]) {
				continue;
			}

			const square = this.squares[squareId];
			seen[squareId] = true;
			seenCount++;

			const topRightNeighbors = [
				this.getCell([square.p[0] + 1, square.p[1]]),
				this.getCell([square.p[0], square.p[1] + 1])
			];
			topRightNeighbors.forEach(function (c) {
				if (c.squareId) {
					queue.push(c.squareId);
				}
			});
		}

		return this.squares.length === seenCount;
	}

	columnEmpty(x: number): boolean {
		for (let square of this.squares) {
			if (square.p[0] === x) {
				return false;
			}
		}
		return true;
	}

	rowEmpty(y: number): boolean {
		for (let square of this.squares) {
			if (square.p[1] === y) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Performs a single siphon step: removes the square at (0, 1) or (1, 0) and
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
			if (this.hasSquare([0, 1])) {
				yield* this.doRightSiphonRemoval();
				if (this.hasSquare([1, 1])) {
					printMiniStep('Move square at (1, 1) to siphon position');
					yield new Move(this, [1, 1], MoveDirection.S);
					yield* this.doRightSiphonRemoval();
				}
				if (this.hasSquare([0, 1])) {
					yield* this.doTopSiphonRemoval();
				}
			} else if (this.hasSquare([1, 0])) {
				yield* this.doTopSiphonRemoval();
				if (this.hasSquare([1, 1])) {
					printMiniStep('Move square at (1, 1) to siphon position');
					yield new Move(this, [1, 1], MoveDirection.W);
					yield* this.doTopSiphonRemoval();
				}
				if (this.hasSquare([1, 0])) {
					yield* this.doRightSiphonRemoval();
				}
			}
		}
	}

	/**
	 * Removes the square at (1, 0) and puts it in the line being built.
	 */
	*doRightSiphonRemoval(): Algorithm {
		printMiniStep('Siphon away (1, 0)');
		yield new Move(this, [1, 0], MoveDirection.SW);
		let x = 0;
		while (this.hasSquare([x - 1, 0])) {
			yield new Move(this, [x, -1], MoveDirection.W);
			x--;
		}
		yield new Move(this, [x, -1], MoveDirection.WN);
	}

	/**
	 * Removes the square at (0, 1) and puts it in the line being built.
	 */
	*doTopSiphonRemoval(): Algorithm {
		printMiniStep('Siphon away (0, 1)');
		let x = 0;
		while (this.hasSquare([x - 1, 0])) {
			yield new Move(this, [x, 1], MoveDirection.W);
			x--;
		}
		yield new Move(this, [x, 1], MoveDirection.WS);
	}

	/**
	 * Fills the empty cell at (1, 0) or (0, 1) by executing a siphoning path.
	 * This is guaranteed to keep the configuration siphonable except possibly
	 * for a single parity square, which can be removed by calling this method
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
		const boundary = this.outsideSquares().map(b => b.p);

		// remove duplicated origin in the boundary
		boundary.pop();

		if (viaLeft) {
			// outsideSquares() returns the boundary in counter-clockwise order,
			// so if we want to follow the left boundary (upwards), we'll need
			// to reverse the boundary first
			boundary.reverse();

			// we need to ensure that the boundary won't start with (0, 0)
			// because otherwise we run into modulo issues later (trying to
			// access boundary[startIndex - 1], to be precise)

			// if we follow the bottom boundary, this is guaranteed by the
			// fact that when this method is called, the first square will
			// already have been siphoned, so there is a square in (-1, 0) that
			// outsideSquares() will use as its starting point

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

		// step 2: if removing the target would result in a near parity square,
		// take that square instead

		const goal = viaLeft ? '(0, 1)' : '(1, 0)';
		const direction = viaLeft ? 'left' : 'bottom';
		let detectedNearParitySquare = false;

		// we can detect that this near square would be a parity square by seeing
		// that (1) it is the S-neighbor of the target, and (2) it has no
		// S-neighbor itself
		const potentialNearSquare = boundary[targetIndex - 1];
		if (potentialNearSquare[0] === target[0] - (viaLeft ? 1 : 0) &&
			potentialNearSquare[1] === target[1] - (viaLeft ? 0 : 1) &&
			!this.hasSquare([potentialNearSquare[0] - (viaLeft ? 1 : 0), potentialNearSquare[1] - (viaLeft ? 0 : 1)])) {
			printMiniStep(`Fill ${goal} again with a ${direction} boundary ` +
				`to (${boundary[targetIndex - 1][0]}, ` +
				`${boundary[targetIndex - 1][1]}) ` +
				`(not to (${target[0]}, ${target[1]}) ` +
				`because that would make ` +
				`(${boundary[targetIndex - 1][0]}, ` +
				`${boundary[targetIndex - 1][1]}) ` +
				`an unresolvable parity square)`);
			target = boundary[targetIndex - 1];
			targetIndex--;
			detectedNearParitySquare = true;
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
		if (this.hasSquare(viaLeft ? [0, 2] : [2, 0])) {
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
			// (this is necessary because we may need to remove a parity square
			// in the end of the path and we cannot do that with the regular
			// move path because it would disconnect the parity square)
			if (i === targetIndex - 1 &&
				emptySpace[0] === boundary[i + 1][0] - 1 &&
				emptySpace[1] === boundary[i + 1][1] - 1 &&
				!this.hasSquare([boundary[i + 1][0] - (viaLeft ? 1 : 0), boundary[i + 1][1] - (viaLeft ? 0 : 1)])) {
				printMiniStep(`Fix parity square ` +
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

		// step 4: if removing the target resulted in a far parity square, do any
		// monotone move on that square to get rid of it
		const potentialFarSquare = boundary[targetIndex + 1];
		if (this.hasOneNeighbor(this.getSquare(potentialFarSquare)!)) {
			if (detectedNearParitySquare) {
				printMiniStep(`We made a parity square ` +
					`(${potentialFarSquare[0]}, ${potentialFarSquare[1]}), ` +
					`but we will fix it in the next siphoning step`);
			} else {
				printMiniStep(`Do monotone moves to remove parity square ` +
					`(${potentialFarSquare[0]}, ${potentialFarSquare[1]})`);
				yield* this.doFreeMoves(potentialFarSquare);
			}
		}
	}

	/**
	 * Do any free moves (W, S, SW, WS) possible, starting from the given square,
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
			//throw new Error('no free move available to remove parity square');
			break;
		}
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
	 * Checks if a square has only one neighbor (in 4-connectivity), that is, if
	 * it is a ‘dead end’.
	 */
	hasOneNeighbor(square: Square): boolean {
		return this.degree(square) === 1;
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
	 * Return all gaps, sorted descending on x-coordinate, then in case of
	 * ties descending on y-coordinate.
	 */
	gaps(): [number, number][] {

		// TODO fix this to be our new definition of a gap

		const [minX, minY, ,] = this.bounds();

		// find all empty cells (empty cell: cell without a square that has E and NE neighbors)
		return this.squares
			.map((square): [number, number] => [square.p[0] - 1, square.p[1] - 1])
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

		//return (this.getSquare([x + 1, y])!.connectivity === 2) &&
		//		(this.getSquare([x + 1, y + 1])!.connectivity === 2) &&
		//		(this.getSquare([x, y + 1])!.connectivity === 2);
	}

	isEmptyCell([x, y]: [number, number]): boolean {
		if (this.getSquare([x, y])) {
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
		while (this.hasSquare([x + 1, y])) {
			yield new Move(this, [x + 1, y], MoveDirection.W);
			x++;
		}
		// if did only one step, we need to tuck the last square in the previous
		// into the gap, because otherwise we break 2-connectivity
		if (x === xOriginal + 1) {
			printMiniStep('Do extra tuck from the row above to maintain 2-connectivity');
			yield* this.doTuck([x, y + 1]);
		}
		printMiniStep(`Bubbling done because (${x + 1}, ${y}) is empty`);
	}

	/**
	 * Checks if (one or more) tucks are needed to move the row of squares to the
	 * right of the given coordinate to the left.
	 */
	needsTuck([x, y]: [number, number]): boolean {
		while (this.hasSquare([x + 1, y])) {
			if (!this.hasSquare([x + 1, y + 1]) && !this.hasSquare([x + 1, y - 1])) {
				return true;
			}
			x++;
		}
		return false;
	}

	/**
	 * Starting from the given position, walk to the right until the last square,
	 * and shove that square to the next row.
	 */
	*doTuck([x, y]: [number, number]): Algorithm {
		while (this.hasSquare([x + 1, y])) {
			x++;
		}
		if (this.hasSquare([x - 1, y - 1])) {
			yield new Move(this, [x, y], MoveDirection.S);
			return;
		}
		yield new Move(this, [x, y], MoveDirection.SW);
		x--;
		while (!this.hasSquare([x - 1, y - 1])) {
			yield new Move(this, [x, y - 1], MoveDirection.W);
			x--;
		}
	}

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
			square.dotsLayer.removeChildren();
			this.getCell(square.p).squareId = i;
		}
		this.currentMove = null;
		this.markComponents();
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
	 * Returns the bridge limit L.
	 */
	bridgeLimit(): number {
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
	 * Generates the component tree.
	 */
	makeComponentTree(): ComponentTree | null {

		// don't try to find components if the configuration is disconnected
		if (!this.isConnected()) {
			return null;
		}

		let seen = Array(this.squares.length).fill(false);
		const outside = this.outsideSquares();
		let stack = [];

		// walk over the outside
		const origin = outside[0];
		let trees: ComponentTree[] = [];
		let newBranch = false;
		for (let i = 0; i < outside.length; i++) {
			const square = outside[i];
			const squareId = this.getSquareId(square.p)!;

			// if we've not seen this square, put it on the stack
			// else mark its component and pop it
			if (!seen[squareId]) {
				seen[squareId] = true;
				stack.push(squareId);
				if (square.componentStatus !== ComponentStatus.CHUNK_STABLE && square.componentStatus !== ComponentStatus.CHUNK_CUT) {
					newBranch = true;
				}
			} else if (stack.length >= 1 && stack[stack.length - 2] === squareId) {
				let cId = stack.pop()!;

				let tree = new ComponentTree(1);
				if (newBranch) {
					trees.push(tree);
					newBranch = false;
				} else {
					tree.children = trees;
					trees = [tree];
				}
				tree.outsideSquares.push(this.squares[cId]);
				tree.outsideSquares.push(this.squares[squareId]);
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

				while (stack.length > 1 && stack[stack.length - 1] !== squareId) {
					let cId = stack.pop()!;
					//components[cId] = components[cId] !== -1 ? 3 : 2;
					tree.outsideSquares.push(this.squares[cId]);
				}
				tree.outsideSquares.push(this.squares[stack[stack.length - 1]]);

				// TODO need to do this to find triple crosses
				/*if (stack.length > 1) {
					let oneTree = new ComponentTree(1);
					oneTree.children = [tree];
					oneTree.outsideSquares.push(this.squares[stack[stack.length - 1]]);
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
	 * Finds the empty space that we are going to slime to from the given
	 * leaf.
	 */
	findSlimeTarget(leaf: Square): Square {
		return this.getSquare([0, 0])!;
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
	bridgeCapacity(b: Square): number {

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
	 * Returns the shortest path in the 4-adjacency graph between the given
	 * source and target squares.
	 */
	shortestSquarePath(from: Square, to: Square): Square[] {

		// do a BFS
		let seen = Array(this.squares.length).fill(false);
		let parent: (Square | null)[] = Array(this.squares.length).fill(null);
		let queue: [number, Square | null][] = [[this.getSquareId(from.p)!, null]];

		while (queue.length !== 0) {
			const [squareId, p] = queue.shift()!;
			if (seen[squareId]) {
				continue;
			}

			const square = this.squares[squareId];
			seen[squareId] = true;
			parent[squareId] = p;

			const neighbors = [
				this.getCell([square.p[0] - 1, square.p[1]]),
				this.getCell([square.p[0] + 1, square.p[1]]),
				this.getCell([square.p[0], square.p[1] - 1]),
				this.getCell([square.p[0], square.p[1] + 1])
			];
			neighbors.forEach(function (c) {
				if (c.squareId) {
					queue.push([c.squareId, square]);
				}
			});
		}

		// reconstruct the path
		let square = to;
		let path = [to];
		while (square.p[0] !== from.p[0] || square.p[1] !== from.p[1]) {
			square = parent[this.getSquareId(square.p)!]!;
			path.unshift(square);
		}

		return path;
	}

	/**
	 * Returns the list of cells that need to be filled to build a bridge
	 * between the given squares.
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

		// remove the source square itself
		cells.shift();

		return cells;
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

