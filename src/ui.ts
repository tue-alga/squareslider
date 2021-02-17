import * as PIXI from 'pixi.js';
import {Constants} from './cubes-simulator';

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
	static readonly BALLOON_WIDTH = 150;
	static readonly BALLOON_HEIGHT = 34;

	clickHandler: (() => void) | null = null;

	private enabled: boolean = true;
	private pressed: boolean = false;

	private balloon = new PIXI.Container();
	private hovered: boolean = false;

	constructor(public icon: string,
			public tooltip: string,
			public shortcut?: string,
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
		background.hitArea = new PIXI.Rectangle(0, 0,
			Button.BUTTON_SIZE, Button.BUTTON_SIZE);
		background.on('click', () => {
			if (this.enabled && this.clickHandler) {
				this.clickHandler();
			}
		});
		background.on('tap', () => {
			if (this.enabled && this.clickHandler) {
				this.clickHandler();
			}
		});
		background.on('mousemove', () => {
			this.hovered = true;
			this.balloon.visible = true;
		});
		background.on('mouseout', () => {
			this.hovered = false;
			this.balloon.visible = false;
		});
		this.pixi.addChild(background);

		const icon = new PIXI.Sprite(
			PIXI.Loader.shared.
				resources['icons/' + this.icon + '.png'].texture);
		icon.width = Button.BUTTON_SIZE;
		icon.height = Button.BUTTON_SIZE;
		if (!this.enabled) {
			icon.alpha = 0.3;
		}
		this.pixi.addChild(icon);

		this.balloon = new PIXI.Container();
		this.pixi.addChild(this.balloon);
		this.balloon.visible = this.hovered;
		if (!this.enabled) {
			this.balloon.alpha = 0.5;
		}

		let height = Button.BALLOON_HEIGHT;
		if (this.shortcut) {
			height += 12;
		}

		const balloonShadow = new PIXI.Graphics();
		balloonShadow.beginFill(0x000000);
		balloonShadow.drawRoundedRect(
			(-Button.BALLOON_WIDTH + Button.BUTTON_SIZE) / 2,
			-height - 4,
			Button.BALLOON_WIDTH,
			height,
			height / 2);
		balloonShadow.endFill();
		balloonShadow.filters = [new PIXI.filters.BlurFilter(10)];
		balloonShadow.alpha = 0.3;
		this.balloon.addChild(balloonShadow);

		const balloonBackground = new PIXI.Graphics();
		balloonBackground.beginFill(0x222222);
		balloonBackground.drawRoundedRect(
			(-Button.BALLOON_WIDTH + Button.BUTTON_SIZE) / 2,
			-height - 4,
			Button.BALLOON_WIDTH,
			height,
			height / 2);
		balloonBackground.endFill();
		this.balloon.addChild(balloonBackground);

		const balloonText = new PIXI.Text(this.tooltip,
			Constants.tooltipStyle);
		balloonText.anchor.set(0.5, 0.5);
		balloonText.x = Button.BUTTON_SIZE / 2;
		balloonText.y = -height / 2 - 5;
		this.balloon.addChild(balloonText);

		if (this.shortcut) {
			const shortcutText = new PIXI.Text("[" + this.shortcut + "]",
				Constants.tooltipSmallStyle);
			shortcutText.anchor.set(0.5, 0.5);
			shortcutText.x = Button.BUTTON_SIZE / 2;
			balloonText.y = -height / 2 - 12;
			shortcutText.y = -height / 2 + 6;
			this.balloon.addChild(shortcutText);
		}
	}

	getWidth(): number {
		return Button.BUTTON_SIZE;
	}

	getHeight(): number {
		return Button.BUTTON_SIZE;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		this.rebuildPixi();
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	setPressed(pressed: boolean): void {
		this.pressed = pressed;
		this.rebuildPixi();
	}

	isPressed(): boolean {
		return this.pressed;
	}

	setIcon(icon: string): void {
		this.icon = icon;
		this.rebuildPixi();
	}

	togglePressed(): void {
		this.setPressed(!this.pressed);
	}

	setTooltip(tooltip: string): void {
		this.tooltip = tooltip;
		this.rebuildPixi();
	}

	onClick(handler: () => void): void {
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

