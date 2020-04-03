import * as PIXI from 'pixi.js';
import {DropShadowFilter} from 'pixi-filters';

abstract class Component {
	protected readonly pixi = new PIXI.Container();

	getPixi(): PIXI.DisplayObject {
		return this.pixi;
	}

	setPosition(x: number, y: number): void {
		this.pixi.x = x;
		this.pixi.y = y;
	}

	/**
	 * Reconstructs the component and stores it into this.pixi.
	 *
	 * This is called by the constructor to build the component for the first
	 * time, and can be called later when the component needs to be updated.
	 */
	abstract rebuildPixi(): void;

	abstract getWidth(): number;
	abstract getHeight(): number;
}

class Button extends Component {
	static readonly BUTTON_SIZE = 48;

	clickHandler: (() => void) | null = null;

	//private hovering: boolean = false;
	
	private pressed: boolean = false;

	constructor(public icon: string,
			public tooltip: string,
			clickHandler?: () => void) {
		super();
		if (clickHandler) {
			this.clickHandler = clickHandler;
		}
	}

	rebuildPixi(): void {
		this.pixi.removeChildren();

		const background = new PIXI.Graphics();
		if (this.pressed) {
			background.beginFill(0xdddddd);
		} else {
			background.beginFill(0xffffff);
		}
		background.drawCircle(
			Button.BUTTON_SIZE / 2,
			Button.BUTTON_SIZE / 2,
			Button.BUTTON_SIZE / 2);
		background.endFill();
		background.interactive = true;
		if (this.clickHandler) {
			background.on('click', this.clickHandler);
		}
		this.pixi.addChild(background);

		const icon = new PIXI.Sprite(
			PIXI.Loader.shared.
				resources['icons/' + this.icon + '.png'].texture);
		icon.width = Button.BUTTON_SIZE;
		icon.height = Button.BUTTON_SIZE;
		this.pixi.addChild(icon);
	}

	getWidth(): number {
		return Button.BUTTON_SIZE;
	}

	getHeight(): number {
		return Button.BUTTON_SIZE;
	}

	setPressed(pressed: boolean) {
		this.pressed = pressed;
		this.rebuildPixi();
	}

	onClick(handler: () => void) {
		this.clickHandler = handler;
		this.rebuildPixi();
	}

	removeOnClick() {
		this.clickHandler = null;
		this.rebuildPixi();
	}
}

class Separator extends Component {
	static readonly BUTTON_SIZE = 48;

	rebuildPixi(): void {
		this.pixi.removeChildren();

		const line = new PIXI.Graphics();
		line.beginFill(0x222222);
		line.drawRect(
			10, 0,
			2,
			Button.BUTTON_SIZE);
		line.endFill();
		this.pixi.addChild(line);
	}

	getWidth(): number {
		return 22;
	}

	getHeight(): number {
		return Button.BUTTON_SIZE;
	}
}

class Toolbar extends Component {

	static readonly CORNER_RADIUS = 48;
	static readonly X_MARGIN = 22;
	static readonly Y_MARGIN = 16;
	static readonly BOTTOM_MARGIN = 4;

	private children: Component[] = [];

	constructor() {
		super();
	}

	rebuildPixi(): void {
		this.pixi.removeChildren();

		const width = this.getWidth();
		const height = this.getHeight();

		// background fill
		const background = new PIXI.Graphics();
		background.beginFill(0xffffff);
		background.drawRoundedRect(
			0, 0,
			width, height + Toolbar.CORNER_RADIUS,
			Toolbar.CORNER_RADIUS);
		background.endFill();
		background.interactive = true;

		// backdrop shadow
		const shadow = new PIXI.Graphics();
		shadow.beginFill(0x000000);
		shadow.drawRoundedRect(
			0, 2,
			width, height + Toolbar.CORNER_RADIUS,
			Toolbar.CORNER_RADIUS);
		shadow.endFill();
		shadow.alpha = 0.3;
		shadow.filters = [new PIXI.filters.BlurFilter(10)];

		this.pixi.addChild(shadow, background);

		// children
		let x = Toolbar.X_MARGIN;
		for (let i = 0; i < this.children.length; i++) {
			const child = this.children[i];
			child.setPosition(x, Toolbar.Y_MARGIN);
			x += child.getWidth() + Toolbar.X_MARGIN;
			this.pixi.addChild(child.getPixi());
		}
	}

	addChild(child: Component): void {
		child.rebuildPixi();
		this.children.push(child);
	}

	getWidth(): number {
		let width = 0;
		for (let i = 0; i < this.children.length; i++) {
			width += this.children[i].getWidth() + Toolbar.X_MARGIN;
		}
		return width + Toolbar.X_MARGIN;
	}

	getHeight(): number {
		let height = 0;
		for (let i = 0; i < this.children.length; i++) {
			height = Math.max(this.children[i].getHeight());
		}
		return height + Toolbar.Y_MARGIN + Toolbar.BOTTOM_MARGIN;
	}
}

export {Button, Separator, Toolbar};

