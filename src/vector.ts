class Vector {
	constructor(public x: number, public y: number) {}

	equals(v: Vector): boolean {
		return this.x === v.x && this.y === v.y;
	}

	add(v: Vector): Vector {
		return new Vector(this.x + v.x, this.y + v.y);
	}

	subtract(v: Vector): Vector {
		return new Vector(this.x - v.x, this.y - v.y);
	}

	multiply(f: number): Vector {
		return new Vector(f * this.x, f * this.y);
	}

	rotateLeft(): Vector {
		return new Vector(-this.y, this.x);
	}

	rotateRight(): Vector {
		return new Vector(this.y, -this.x);
	}

	invert(): Vector {
		return new Vector(-this.x, -this.y);
	}
}

Vector.prototype.toString = function () {
	return '(' + this.x + ', ' + this.y + ')';
};

export {Vector};

