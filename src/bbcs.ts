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

	private bottomBar: Toolbar;
	private runButton: Button;
	private pauseButton: Button;

	constructor(app: PIXI.Application) {
		this.app = app;

		this.bottomBar = new Toolbar();
		this.runButton = new Button("play", "Run simulation");
		this.pauseButton = new Button("pause", "Pause simulation");
		this.runButton.onClick(
			() => {
				this.simulationMode = SimulationMode.RUNNING;
				this.runButton.setPressed(true);
				this.pauseButton.setPressed(false);
			}
		);
		this.pauseButton.onClick(
			() => {
				this.simulationMode = SimulationMode.PAUSED;
				this.runButton.setPressed(false);
				this.pauseButton.setPressed(true);
			}
		);
		this.pauseButton.setPressed(true);
		this.bottomBar.addChild(this.runButton);
		this.bottomBar.addChild(this.pauseButton);

		this.bottomBar.addChild(new Separator());
		const selectButton = new Button(
			"select", "Select objects",
			() => {
				this.editMode = EditMode.SELECT;
			}
		);
		selectButton.setPressed(true);
		this.bottomBar.addChild(selectButton);

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
			if (this.time - Math.floor(this.time) > 1 - Math.SQRT2 / 2) {
				this.checkOverlapping();
			}
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

	checkOverlapping() {
		for (let i = 0; i < this.balls.length; i++) {
			for (let j = i + 1; j < this.balls.length; j++) {
				const ball1 = this.balls[i];
				const ball2 = this.balls[j];
				if (ball1.x + ball1.d.vx === ball2.x + ball2.d.vx &&
						ball1.y + ball1.d.vy === ball2.y + ball2.d.vy) {
					this.simulationMode = SimulationMode.PAUSED;
					window.alert("Illegal operation: Two balls collided head-on");
					this.runButton.setPressed(false);
					this.pauseButton.setPressed(true);
					this.time = this.timeStep + (1 - Math.SQRT2 / 2);
				}
			}
		}
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

