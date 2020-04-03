import * as PIXI from 'pixi.js';

import {Ball, Direction} from './ball';

type WorldCell = {
	ball: Ball | null;
	positiveWall: PIXI.Graphics | null;
	negativeWall: PIXI.Graphics | null;
};

/**
 * Collection of balls and walls on the grid.
 */
class World {

	world: WorldCell[][] = [];

	private posWallPixi: PIXI.Graphics;
	private negWallPixi: PIXI.Graphics;

	pixi = new PIXI.Container();

	balls: Ball[] = [];

	constructor() {
		this.posWallPixi = new PIXI.Graphics;
		this.posWallPixi.lineStyle(4, 0x222222);
		this.posWallPixi.moveTo(0, 0);
		this.posWallPixi.lineTo(80, -80);
		this.pixi.addChild(this.posWallPixi);
		
		this.negWallPixi = new PIXI.Graphics;
		this.negWallPixi.lineStyle(4, 0x222222);
		this.negWallPixi.moveTo(0, -80);
		this.negWallPixi.lineTo(80, 0);
		this.pixi.addChild(this.negWallPixi);

		// grid lines (TODO)
		let grid = new PIXI.Graphics();
		grid.lineStyle(3, 0xdddddd);
		for (let x = 0; x < 4000; x += 80) {
			grid.moveTo(x, 0);
			grid.lineTo(x, 4000);
			grid.moveTo(0, x);
			grid.lineTo(4000, x);
		}
		this.pixi.addChild(grid);
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
				ball: null,
				positiveWall: null,
				negativeWall: null,
			};
		}
		return column[y];
	}

	private checkWallCoords(from: [number, number], to: [number, number]):
			[number, number, number, number] {
		const [x1, y1] = from;
		const [x2, y2] = to;
		if (Math.abs(x2 - x1) !== 1 || Math.abs(y2 - y1) !== 1) {
			throw `Illegal wall check from (${x1}, ${y1}) to (${y1}, ${y2}) ` +
					`(should be diagonal, one apart)`;
		}

		return [x1, y1, x2, y2];
	}

	hasWall(from: [number, number], to: [number, number]): boolean {
		const [x1, y1, x2, y2] = this.checkWallCoords(from, to);
		const [x3, y3] = [Math.min(x1, x2), Math.min(y1, y2)];
		let hasWall: boolean;
		if ((x3 === x1 && y3 === y1) || (x3 === x2 && y3 === y2)) {
			hasWall = !!(this.getCell(x3, y3).positiveWall);
		} else {
			hasWall = !!(this.getCell(x3, y3).negativeWall);
		}
		return hasWall;
	}

	addWall(from: [number, number], to: [number, number]): void {
		const [x1, y1, x2, y2] = this.checkWallCoords(from, to);
		const [x3, y3] = [Math.min(x1, x2), Math.min(y1, y2)];
		if ((x3 === x1 && y3 === y1) || (x3 === x2 && y3 === y2)) {
			const pixi = new PIXI.Graphics(this.posWallPixi.geometry);
			pixi.x = x3 * 80;
			pixi.y = -y3 * 80;
			this.getCell(x3, y3).positiveWall = pixi;
			this.pixi.addChild(pixi);
		} else {
			const pixi = new PIXI.Graphics(this.negWallPixi.geometry);
			pixi.x = x3 * 80;
			pixi.y = -y3 * 80;
			this.getCell(x3, y3).negativeWall = pixi;
			this.pixi.addChild(pixi);
		}
	}

	getBall(x: number, y: number): Ball | null {
		return this.getCell(x, y).ball;
	}

	addBall(x: number, y: number, d: Direction): void {
		if (this.getBall(x, y)) {
			throw `Tried to insert ball on top of another ball ` +
					`at (${x}, ${y})`;
		}
		const ball = new Ball(this, x, y, d);
		this.getCell(x, y).ball = ball;
		this.balls.push(ball);
		this.pixi.addChild(ball.pixi);
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
		ball.p.x = x2;
		ball.p.y = y2;
		this.getCell(x2, y2).ball = ball;
	}

	nextStep(): void {
		this.balls.forEach((ball) => {
			const from: [number, number] =
					[ball.p.x, ball.p.y];
			const to: [number, number] =
					[ball.p.x + ball.d.vx, ball.p.y + ball.d.vy];
			this.moveBall(from, to);
		});
		this.balls.forEach((ball) => {
			ball.handleWallCollisions(this);
		});
		this.balls.forEach((ball) => {
			ball.handleBallCollisions(this);
		});
	}

	reset(): void {
		this.world = [];
		this.balls.forEach((ball) => {
			ball.p.x = ball.resetPosition.x;
			ball.p.y = ball.resetPosition.y;
			ball.d = ball.resetDirection;
			this.getCell(ball.p.x, ball.p.y).ball = ball;
		});
	}
}

export {World};

