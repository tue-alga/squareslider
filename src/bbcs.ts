import * as PIXI from 'pixi.js';

import {Direction, Ball} from './ball';
import {World} from './world';
import {Button, Separator, Toolbar} from './ui';

enum EditMode {
	SELECT, ADD_BALL, ADD_WALL, DELETE
}

enum SimulationMode {
	RUNNING, PAUSED
}

class BBCS {
	private app: PIXI.Application;

	editMode: EditMode = EditMode.SELECT;
	time: number = 0.0;
	timeStep: number = 0;

	simulationMode: SimulationMode = SimulationMode.PAUSED;
	timeSpeed: number = 0.02;

	world: World;

	private bottomBar: Toolbar;
	private runButton: Button;
	private pauseButton: Button;

	constructor(app: PIXI.Application) {
		this.app = app;

		this.world = new World();

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
		this.app.stage.addChild(this.world.pixi);
		this.world.pixi.scale.set(.6, .6);  // TODO

		/*this.world.addBall(2, -2, Direction.RIGHT);
		this.world.addBall(4, -4, Direction.UP);
		this.world.addBall(8, -4, Direction.LEFT);
		this.world.addBall(10, -8, Direction.UP);
		this.world.addBall(7, -5, Direction.LEFT);
		//this.world.addBall(6, -2, Direction.DOWN);
		this.world.addBall(12, -12, Direction.UP);
		//this.world.addBall(12, 6, Direction.DOWN);*/
		
		// and gate
		this.world.addBall(3, -5, Direction.RIGHT);
		this.world.addBall(6, -2, Direction.DOWN);
		this.world.addWall([7, -3], [8, -4]);
		this.world.addWall([4, -8], [5, -9]);

		this.bottomBar.rebuildPixi();
		this.app.stage.addChild(this.bottomBar.getPixi());

		this.world.balls.forEach((ball) => {
			ball.placeDots(0);
		});

		this.app.ticker.add((delta) => {
			this.renderFrame(delta);
		});
	}

	renderFrame(delta: number) {
		if (this.simulationMode == SimulationMode.RUNNING) {
			this.time += this.timeSpeed * (1 + delta);
		}
		while (Math.floor(this.time) > this.timeStep) {
			this.timeStep++;
			try {
				this.world.nextStep(this.timeStep);
			} catch (e) {
				window.alert(`Illegal move: ${e}. Resetting the simulation.`);
				this.simulationMode = SimulationMode.PAUSED;
				this.runButton.setPressed(false);
				this.pauseButton.setPressed(true);
				this.world.reset();
				this.time = 0;
				this.timeStep = 0;
			}
		}
		
		this.bottomBar.setPosition(
			window.innerWidth / 2 - this.bottomBar.getWidth() / 2,
			window.innerHeight - this.bottomBar.getHeight());

		this.world.balls.forEach((ball) => {
			ball.update(this.time, this.timeStep);
		});
	}
}

export {BBCS};

