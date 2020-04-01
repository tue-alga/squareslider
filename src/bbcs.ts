import * as PIXI from 'pixi.js';

import {Direction, Ball} from './ball';
import {Button, Separator, Toolbar} from './ui';

enum EditMode {
	SELECT, ADD_BALL, ADD_WALL, DELETE
}

enum SimulationMode {
	RUNNING, PAUSED
}

class BBCS {

	private app: PIXI.Application;
	field = new PIXI.Container();
	balls: Ball[] = [];

	editMode: EditMode = EditMode.SELECT;
	time: number = 0.0;
	timeStep: number = 0;

	simulationMode: SimulationMode = SimulationMode.PAUSED;
	timeSpeed: number = 0.02;

	bottomBar: Toolbar;

	constructor(app: PIXI.Application) {
		this.app = app;

		this.bottomBar = new Toolbar();
		const runButton = new Button("play", "Run simulation");
		const pauseButton = new Button("pause", "Pause simulation");
		runButton.onClick(
			() => {
				this.simulationMode = SimulationMode.RUNNING;
				runButton.setPressed(true);
				pauseButton.setPressed(false);
			}
		);
		pauseButton.onClick(
			() => {
				this.simulationMode = SimulationMode.PAUSED;
				runButton.setPressed(false);
				pauseButton.setPressed(true);
			}
		);
		pauseButton.setPressed(true);
		this.bottomBar.addChild(runButton);
		this.bottomBar.addChild(pauseButton);

		this.bottomBar.addChild(new Separator());
		this.bottomBar.addChild(new Button(
			"select", "Select objects",
			() => {
				this.editMode = EditMode.SELECT;
			}
		));
		this.bottomBar.addChild(new Button(
			"add-ball", "Add balls",
			() => {
				this.editMode = EditMode.ADD_BALL;
			}
		));
		this.bottomBar.addChild(new Button(
			"add-wall", "Add walls",
			() => {
				this.editMode = EditMode.ADD_WALL;
			}
		));
		this.bottomBar.addChild(new Button(
			"delete", "Delete objects",
			() => {
				this.editMode = EditMode.DELETE;
			}
		));

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

		this.field.scale.set(.6, .6);

		this.balls.push(new Ball(this.field, 2, -2, Direction.RIGHT));
		this.balls.push(new Ball(this.field, 4, -4, Direction.UP));
		this.balls.push(new Ball(this.field, 8, -4, Direction.LEFT));
		this.balls.push(new Ball(this.field, 10, -8, Direction.UP));
		this.balls.push(new Ball(this.field, 7, -5, Direction.LEFT));
		this.balls.push(new Ball(this.field, 6, -2, Direction.DOWN));
		this.balls.push(new Ball(this.field, 12, -12, Direction.UP));
		this.balls.push(new Ball(this.field, 12, 6, Direction.DOWN));

		this.bottomBar.rebuildPixi();
		this.app.stage.addChild(this.bottomBar.getPixi());

		this.app.ticker.add((delta) => {
			this.renderFrame(delta);
		});
	}

	renderFrame(delta: number) {
		if (this.simulationMode == SimulationMode.RUNNING) {
			this.time += this.timeSpeed * (1 + delta);
		}
		while (Math.floor(this.time) > this.timeStep) {
			this.nextStep();
		}
		// TODO also previousStep()
		
		this.bottomBar.setPosition(
			window.innerWidth / 2 - this.bottomBar.getWidth() / 2,
			window.innerHeight - this.bottomBar.getHeight());

		this.balls.forEach((ball) => {
			ball.update(this.time - this.timeStep);
		});
	}

	nextStep() {
		this.timeStep++;
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

