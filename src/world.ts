import * as PIXI from 'pixi.js';
import {Viewport} from 'pixi-viewport';

import {Ball, Color} from './ball';

type WorldCell = {
	ball: Ball | null;
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

class Move {
	constructor(public world: World, public position: [number, number], public direction: MoveDirection) {
	}

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

	targetPosition(): [number, number] {
		return Move.targetPositionFromFields(this.position, this.direction);
	}

	isValidIgnoreConnectivity(): boolean {
		if (this.world.getBall(...this.targetPosition())) {
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
		this.world.moveBall(this.position, this.targetPosition());
	}

	toString(): string {
		const from = this.position;
		const to = this.targetPosition();
		return `(${from[0]}, ${from[1]}) \u2192 (${to[0]}, ${to[1]})`;
	}
}

/**
 * Collection of balls and walls on the grid.
 */
class World {

	world: WorldCell[][] = [];

	viewport = new Viewport();
	pixi = new PIXI.Container();
	grid: PIXI.Mesh;

	balls: Ball[] = [];

	currentMove: Move | null = null;

	constructor() {
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
		this.pixi.addChild(this.grid);
	}

	private getColumn(x: number): WorldCell[] {
		if (!this.world[x]) {
			this.world[x] = [];
		}
		return this.world[x];
	}

	private getCell(x: number, y: number): WorldCell {
		let column = this.getColumn(x);
		if (!column[y]) {
			column[y] = {
				ball: null
			};
		}
		return column[y];
	}

	getBall(x: number, y: number): Ball | null {
		return this.getCell(x, y).ball;
	}

	hasBall(x: number, y: number): boolean {
		return !!this.getBall(x, y);
	}

	addBall(x: number, y: number, color: Color): Ball {
		if (this.getBall(x, y)) {
			throw `Tried to insert ball on top of another ball ` +
					`at (${x}, ${y})`;
		}
		const ball = new Ball(this, x, y, color);
		this.getCell(x, y).ball = ball;
		this.balls.push(ball);
		this.pixi.addChild(ball.pixi);
		return ball;
	}

	moveBall(from: [number, number], to: [number, number]): void {
		const [x1, y1] = from;
		const [x2, y2] = to;

		const ball = this.getBall(x1, y1);
		if (!ball) {
			throw `Tried to move non-existing ball at ` +
					`at (${x1}, ${y1})`;
		}

		if (this.getBall(x2, y2)) {
			throw `Tried to move ball on top of another ball ` +
					`at (${x2}, ${y2})`;
		}

		this.getCell(x1, y1).ball = null;
		ball.p = [x2, y2];
		ball.updatePosition(0, 0);
		this.getCell(x2, y2).ball = ball;
	}

	removeBall(x: number, y: number): void {
		const ball = this.getBall(x, y);
		if (!ball) {
			throw `Tried to remove non-existing ball ` +
					`at (${x}, ${y})`;
		}
		this.pixi.removeChild(ball.pixi);
		this.balls = this.balls.filter((b) => b !== ball);
		this.getCell(x, y).ball = null;
	}

	neighbors(p: [number, number]): {[key: string]: boolean} {
		const x = p[0];
		const y = p[1];
		let has: {[key: string]: boolean} = {};
		has['N'] = this.hasBall(x, y + 1);
		has['NE'] = this.hasBall(x + 1, y + 1);
		has['E'] = this.hasBall(x + 1, y);
		has['SE'] = this.hasBall(x + 1, y - 1);
		has['S'] = this.hasBall(x, y - 1);
		has['SW'] = this.hasBall(x - 1, y - 1);
		has['W'] = this.hasBall(x - 1, y);
		has['NW'] = this.hasBall(x - 1, y + 1);
		return has;
	}

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
		this.balls.forEach(ball => {
			ball.setColor(Color.GRAY);
		});
		/*this.outsideBalls().forEach(ball => {
			if (ball.color.r === Color.GRAY.r) {
				ball.setColor(new Color(170, 170, 170));
			} else {
				ball.setColor(new Color(100, 100, 100));
			}
		})*/;

		// first actually execute the current move
		if (this.currentMove) {
			this.currentMove.execute();
		}

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
		let e;

		while (e = this.emptyCells(), e.length) {

			// find right-most, top-most empty cell
			let best = e[0];
			for (const p of e) {
				if (p[0] > best[0]) {
					best = p;
				} else if (p[0] === best[0] && p[1] > best[1]) {
					best = p;
				}
			}

			// ... and fill it
			yield* this.doBubble(best);
		}

		printStep('No empty cells left, done!');
	}

	emptyCells(): [number, number][] {

		const lowestX = this.balls
			.map((ball) => ball.p[0])
			.min();
		const lowestY = this.balls
			.map((ball) => ball.p[1])
			.min();

		// find all empty cells (empty cell: cell without a cube that has E and NE neighbors)
		return this.balls
			.map((ball): [number, number] => [ball.p[0] - 1, ball.p[1] - 1])
			.filter((p) => this.isEmptyCell(p))
			.filter((p) => p[0] >= lowestX && p[1] >= lowestY);
	}

	/**
	 * Performs a bubble move to fill the given gap.
	 */
	*doBubble([x, y]: [number, number]): Generator<Move, void, undefined> {

		printStep(`Bubble move to fill gap (${x}, ${y})`);
		const xOriginal = x;

		while (this.needsTuck([x, y])) {
			printMiniStep('Row is longer than surrounding rows, so tuck to maintain connectivity');
			yield* this.doTuck([x, y]);
		}

		printMiniStep(`Move row to the right of (${x}, ${y}) to the left`);
		while (this.hasBall(x + 1, y)) {
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
		while (this.hasBall(x + 1, y)) {
			if (!this.hasBall(x + 1, y + 1) && !this.hasBall(x + 1, y - 1)) {
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
	*doTuck([x, y]: [number, number]): Generator<Move, void, unknown> {
		while (this.hasBall(x + 1, y)) {
			x++;
		}
		if (this.hasBall(x - 1, y - 1)) {
			yield new Move(this, [x, y], MoveDirection.S);
			return;
		}
		yield new Move(this, [x, y], MoveDirection.SW);
		x--;
		while (!this.hasBall(x - 1, y - 1)) {
			yield new Move(this, [x, y - 1], MoveDirection.W);
			x--;
		}
	}

	isEmptyCell(p: [number, number]): boolean {
		if (this.getBall(...p)) {
			return false;
		}

		const hasNENeighbor: boolean = this.getBall(p[0] + 1, p[1] + 1) !== null;
		const hasENeighbor: boolean = this.getBall(p[0] + 1, p[1]) !== null;

		return hasNENeighbor && hasENeighbor;
	}

	updatePositions(time: number, timeStep: number): void {
		this.balls.forEach((ball) => {
			ball.updatePosition(time, timeStep);
		});
		if (this.currentMove) {
			const [x, y] = this.currentMove.position;
			this.getBall(x, y)?.updatePosition(time, timeStep, this.currentMove);
		}
	}

	reset(): void {
		this.balls.forEach((ball) => {
			this.getCell(...ball.p).ball = null;
		});
		this.balls.forEach((ball) => {
			ball.p = [ball.resetPosition[0], ball.resetPosition[1]];
			ball.dots = [];
			ball.dotsLayer.removeChildren();
			this.getCell(...ball.p).ball = ball;
		});
	}

	isConnected(skip?: [number, number]): boolean {
		if (!this.balls.length) {
			return true;
		}

		// do BFS from ball 0 to check if we can reach all balls
		let seen = Array(this.balls.length).fill(false);
		let seenCount = 0;
		let queue = [0];

		if (skip) {
			// mark the skipped ball so we won't visit it again
			const skipBall = this.getBall(...skip);
			if (skipBall) {
				const skipIndex = this.balls.indexOf(skipBall);
				seen[skipIndex] = true;
				seenCount++;

				// special case: if we were about to start our BFS with the
				// skipped ball, then pick another ball to start with
				// (note that if the configuration has exactly 1 ball, which
				// is then skipped, the function should return true
				// but that works because the BFS starting at the skipped
				// ball will not encounter any balls)
				if (skipIndex === 0 && this.balls.length > 1) {
					queue = [1];
				}
			}
		}

		while (queue.length !== 0) {
			const ballId = queue.shift()!;
			if (seen[ballId]) {
				continue;
			}
			
			const ball = this.balls[ballId];
			seen[ballId] = true;
			seenCount++;

			const neighbors = [
				this.getCell(ball.p[0] - 1, ball.p[1]),
				this.getCell(ball.p[0] + 1, ball.p[1]),
				this.getCell(ball.p[0], ball.p[1] - 1),
				this.getCell(ball.p[0], ball.p[1] + 1)
			];
			const self = this;
			neighbors.forEach(function(c) {
				if (c.ball) {
					queue.push(self.balls.indexOf(c.ball));
				}
			});
		}

		return this.balls.length === seenCount;
	}

	downmostLeftmost(): Ball | null {
		if (!this.balls.length) {
			return null;
		}

		const lowestY = this.balls
			.map((ball) => ball.p[1])
			.min();

		const lowestX = this.balls
			.filter((ball) => ball.p[1] === lowestY)
			.map((ball) => ball.p[0])
			.min();

		return this.getBall(lowestX, lowestY);
	}

	/**
	 * Returns a list of cubes on the outside of the configuration, in
	 * counter-clockwise order.
	 */
	outsideBalls(): Ball[] {
		if (!this.balls.length) {
			return [];
		}
		const start = this.downmostLeftmost()!;
		let outside: Ball[] = [];
		let position: [number, number] = [start.p[0], start.p[1]];
		let direction: string | null = 'S';
		do {
			outside.push(this.getBall(...position)!);
			direction = this.nextOnOutside(position, direction);
			if (!direction) {
				break;
			}
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
		} while (position[0] !== start.p[0] || position[1] !== start.p[1]);
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

	serialize(): string {
		let cubes: any = [];
		this.balls.forEach((cube) => {
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
			this.addBall(cube['x'], cube['y'], color);
		});
	}
}

export {World, Move};

