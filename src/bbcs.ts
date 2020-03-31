import * as PIXI from 'pixi.js'

import {Direction, Ball} from './ball'

class BBCS {

	private app: PIXI.Application;
	field = new PIXI.Container();
	balls: Ball[] = [];

	time: number = 0.0;
	timeStep: number = 0;

	timeSpeed: number = 0.005;

	constructor(app: PIXI.Application) {
		this.app = app;
		this.setup();
	}

	setup() {
		this.app.stage.addChild(this.field);

		let grid = new PIXI.Graphics();
		grid.lineStyle(3, 0xdddddd);
		for (let x = 40; x < 2000; x += 80) {
			grid.moveTo(x, 0);
			grid.lineTo(x, 2000);
			grid.moveTo(0, x);
			grid.lineTo(2000, x);
		}
		this.field.addChild(grid);

		this.field.scale.set(1, 1);

		this.balls.push(new Ball(this.field, 2, -2, Direction.RIGHT));
		this.balls.push(new Ball(this.field, 4, -4, Direction.UP));
		this.balls.push(new Ball(this.field, 8, -4, Direction.LEFT));
		this.balls.push(new Ball(this.field, 10, -8, Direction.UP));
		this.balls.push(new Ball(this.field, 7, -5, Direction.LEFT));
		this.balls.push(new Ball(this.field, 6, -2, Direction.DOWN));
		this.balls.push(new Ball(this.field, 12, -12, Direction.UP));
		this.balls.push(new Ball(this.field, 12, 6, Direction.DOWN));

		this.app.ticker.add((delta) => {
			this.renderFrame(delta);
		});
	}

	renderFrame(delta: number) {
		this.time += this.timeSpeed * (1 + delta);
		while (Math.floor(this.time) > this.timeStep) {
			this.nextStep();
		}
		// TODO also previousStep()

		this.balls.forEach((ball) => {
			ball.updatePosition(this.time - this.timeStep);
		});
	}

	nextStep() {
		this.timeStep++;
		console.log('step ' + this.timeStep);
		this.balls.forEach((ball) => {
			ball.x += ball.d.vx;
			ball.y += ball.d.vy;
		});
		this.balls.forEach((ball) => {
			ball.handleCollisions(this.balls);
		});
	}
}

export {BBCS};

