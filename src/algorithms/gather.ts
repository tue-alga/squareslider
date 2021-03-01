import {Algorithm, World, Move, MoveDirection} from '../world';
import {Cube, ComponentStatus} from '../cube';
import {Vector} from '../vector';

class GatherAlgorithm {

    constructor(public world: World) {}

	*execute(): Algorithm {

		//console.log(this.findBoundaryPath(this.world.getCube([1, 0])!, this.world.getCube([0, 1])!));
		// find light square s
		// find two empty spaces around s to be filled
		// find extremal stable square to move in the descendants of s
		// move it
		// handle special pocket cases

		let lightSquare: Cube | null;
		while (lightSquare = this.findLightSquare()) {
			printStep(`Gathering light square (${lightSquare.p[0]}, ${lightSquare.p[1]})`);

			const leaf = this.findLeafInDescendants(lightSquare)!;
			yield* this.walkBoundaryUntil(leaf, lightSquare);
		}
	}

	/**
	 * Finds a light square closest to the root, or null if there are no light
	 * squares in the configuration.
	 */
	findLightSquare(): Cube | null {
		const outside = this.world.outsideCubes();
		const limit = this.world.bridgeLimit();
		for (let i = 0; i < outside.length; i++) {
			const cube = outside[i];
			if (cube.componentStatus === ComponentStatus.CONNECTOR ||
					cube.componentStatus === ComponentStatus.LINK_CUT) {
				const capacity = this.world.bridgeCapacity(cube).length;
				if (capacity < limit) {
					return cube;
				}
			}
		}
		return null;
	}

	/**
	 * Given a light square s, return a square from the descendants of s that
	 * can be safely removed to chunkify s.
	 */
	findLeafInDescendants(c: Cube): Cube | null {

		let seen = Array(this.world.cubes.length).fill(false);
		const outside = this.world.outsideCubes();
		const startIndex = outside.indexOf(c);
		let stack = [];

		// walk over the outside
		for (let i = startIndex; i < outside.length; i++) {
			let cube = outside[i];
			const cubeId = this.world.cubes.indexOf(cube);

			if (!seen[cubeId]) {
				seen[cubeId] = true;
				stack.push(cubeId);

			} else if (stack.length >= 1 && stack[stack.length - 2] === cubeId) {
				// found link stable square
				return this.world.cubes[stack[stack.length - 1]];

			} else {
				// found leaf chunk
				while (true) {
					const c1 = this.world.cubes[stack[stack.length - 1]];
					const c2 = this.world.cubes[stack[stack.length - 2]];
					const c3 = this.world.cubes[stack[stack.length - 3]];
					const dx1 = c2.p[0] - c1.p[0];
					const dy1 = c2.p[1] - c1.p[1];
					const dx2 = c3.p[0] - c2.p[0];
					const dy2 = c3.p[1] - c2.p[1];
					// right turn or U-turn?
					if ((dx1 === -dy2 && dy1 === dx2) ||
							(dx1 === -dx2 && dy1 === -dy2)) {
						return c2;
					}
					stack.pop();
				}
			}
		}

		return null;
	}

	/**
	 * Constructs a path over the boundary, starting from the given cube c,
	 * ending at target (if possible 4-neighbor of target, otherwise
	 * 8-neighbor). The path is possibly non-simple.
	 */
	findBoundaryPath(c: Cube, target: Cube): [number, number][] {
		const outside = this.world.outsideCubes();
		let p = new Vector(...c.p);
		let path: [number, number][] = [[p.x, p.y]];
		let i = outside.indexOf(c) + 1;

		while (outside[i - 1] !== target && outside[i] !== target) {

			const p1 = new Vector(...outside[i].p);
			const p2 = new Vector(...outside[i + 1].p);
			const p3 = new Vector(...outside[i + 2].p);
			const direction = p2.subtract(p1);

			if (p.add(direction).equals(p3)) {
				i += 2;  // skip over concave corner
				continue;
			}

			if (p.equals(p1.add(direction.rotateLeft()))) {
				p = p.add(direction.invert()).add(direction.rotateRight());
				path.push([p.x, p.y]);
			} else if (p.equals(p1.add(direction.invert()))) {
				p = p.add(direction).add(direction.rotateRight());
				path.push([p.x, p.y]);
			} else {
				p = p.add(direction);
				path.push([p.x, p.y]);
				i++;
			}
		}

		return path;
	}

	*walkBoundaryUntil(c: Cube, target: Cube): Algorithm {
		let path = this.findBoundaryPath(c, target);
		for (let i = 0; i < path.length - 1; i++) {
			// TODO pockets zijn irritant
			const cube = this.world.getCube(path[i]);
			if (!cube) {
				continue;
			}
			const move = this.world.getMoveTo(cube, path[i + 1]);
			if (move) {
				yield move;
			}
		}
	}
}

export {GatherAlgorithm};
