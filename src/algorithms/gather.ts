import {Algorithm, World, Move, MoveDirection} from '../world';
import {Cube, ComponentStatus} from '../cube';
import {Vector} from '../vector';

class GatherAlgorithm {

	constructor(public world: World) {}

	*execute(): Algorithm {

		printStep('Gathering');

		//console.log(this.findBoundaryPath(this.world.getCube([1, 0])!, this.world.getCube([0, 1])!));
		// find light square s
		// find two empty spaces around s to be filled
		// find extremal stable square to move in the descendants of s
		// move it
		// handle special pocket cases

		const limit = this.world.bridgeLimit();
		let lightSquare: Cube | null;
		while (lightSquare = this.findLightSquare(limit)) {
			printMiniStep(`Gathering light square (${lightSquare.p[0]}, ${lightSquare.p[1]})`);

			const target = this.findGatherTarget(lightSquare);
			const leaf = this.findLeafInDescendants(lightSquare);
			if (leaf === null) {
				break;
			}
			yield* this.walkBoundaryUntil(leaf, target);
		}
	}

	/**
	 * Finds a light square closest to the root, or null if there are no light
	 * squares in the configuration.
	 */
	findLightSquare(limit: number): Cube | null {
		const outside = this.world.outsideCubes();
		for (let i = 0; i < outside.length; i++) {
			const cube = outside[i];
			if (cube.componentStatus === ComponentStatus.CONNECTOR ||
					cube.componentStatus === ComponentStatus.LINK_CUT) {
				const capacity = this.world.bridgeCapacity(cube);
				if (capacity < limit) {
					return cube;
				}
			}
		}
		return null;
	}

	/**
	 * Given a light square c, returns a (4- or 8-) neighboring empty cell n
	 * of c such that:
	 *
	 *  * if c has degree 2 and the neighbors are on a line, then n is a
	 *    4-neighbor that is inside the bounding box of the configuration
	 *    (unless the configuration was a line);
	 *
	 *  * else, n is an 8-neighbor that is 4-adjacent to two squares
	 *    neighboring c.
	 */
	findGatherTarget(c: Cube): [number, number] {
		const [x, y] = c.p;
		const has = this.world.hasNeighbors(c.p);
		const [minX, minY, , ] = this.world.bounds();
		const self = this;
		const checkNeighbor = function (n: [number, number]): boolean {
			if (self.world.hasCube(n)) {
				return false;
			}
			if (!self.world.hasCube([x, n[1]]) || !self.world.hasCube([n[0], y])) {
				return false;
			}
			const c1 = self.world.getCube([x, n[1]])!;
			const c2 = self.world.getCube([n[0], y])!;
			return c1.componentStatus === ComponentStatus.LINK_CUT ||
					c1.componentStatus === ComponentStatus.LINK_STABLE ||
					c2.componentStatus === ComponentStatus.LINK_CUT ||
					c2.componentStatus === ComponentStatus.LINK_STABLE ||
					(c1.chunkId !== c2.chunkId && c1.chunkId !== -1 && c2.chunkId !== -1);
		};
		if (checkNeighbor([x + 1, y + 1])) {
			return [x + 1, y + 1];
		}
		if (checkNeighbor([x - 1, y + 1])) {
			return [x - 1, y + 1];
		}
		if (checkNeighbor([x - 1, y - 1])) {
			return [x - 1, y - 1];
		}
		if (checkNeighbor([x + 1, y - 1])) {
			return [x + 1, y - 1];
		}
		if (has['N'] && has['S']) {
			if (x === minX) {
				return [x + 1, y];
			} else {
				return [x - 1, y];
			}
		}
		if (has['W'] && has['E']) {
			if (y === minY) {
				return [x, y + 1];
			} else {
				return [x, y - 1];
			}
		}
		throw "tried to gather to a cube with degree less than 2";
	}

	/**
	 * Given a light square s, return a square from the descendants of s, not
	 * edge-adjacent to s itself, that can be safely removed to chunkify s.
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

			} else if (stack.length > 1 && stack[stack.length - 2] === cubeId) {
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
	 * 8-neighbor). The path is in clockwise direction. If this path would
	 * pass along the origin, null is returned instead.
	 */
	findClockwiseBoundaryPath(c: Cube, target: [number, number]):
			[number, number][] | null {
		const outside = this.world.outsideCubes();
		const n = outside.length - 1;
		let p = new Vector(...c.p);
		let path: [number, number][] = [[p.x, p.y]];
		let i = outside.indexOf(c) + 1;

		while (p.x !== target[0] || p.y !== target[1]) {
			if (i >= n) {
				return null;
			}
			const p1 = new Vector(...outside[i % n].p);
			const p2 = new Vector(...outside[(i + 1) % n].p);
			const p3 = new Vector(...outside[(i + 2) % n].p);
			const direction = p2.subtract(p1);

			if (!p1.equals(p3) && p.add(direction).equals(p3)) {
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

	/**
	 * Constructs a path over the boundary, starting from the given cube c,
	 * ending at target (if possible 4-neighbor of target, otherwise
	 * 8-neighbor). The path is in counter-clockwise direction. If this path
	 * would pass along the origin, null is returned instead.
	 */
	findCounterClockwiseBoundaryPath(c: Cube, target: [number, number]):
			[number, number][] | null {
		const outside = this.world.outsideCubes();
		outside.reverse();
		const n = outside.length - 1;
		let p = new Vector(...c.p);
		let path: [number, number][] = [[p.x, p.y]];
		let i = outside.indexOf(c) + 1;

		while (p.x !== target[0] || p.y !== target[1]) {
			if (i >= n) {
				return null;
			}
			const p1 = new Vector(...outside[i % n].p);
			const p2 = new Vector(...outside[(i + 1) % n].p);
			const p3 = new Vector(...outside[(i + 2) % n].p);
			const direction = p2.subtract(p1);

			if (!p1.equals(p3) && p.add(direction).equals(p3)) {
				i += 2;  // skip over concave corner
				continue;
			}

			if (p.equals(p1.add(direction.rotateRight()))) {
				p = p.add(direction.invert()).add(direction.rotateLeft());
				path.push([p.x, p.y]);
			} else if (p.equals(p1.add(direction.invert()))) {
				p = p.add(direction).add(direction.rotateLeft());
				path.push([p.x, p.y]);
			} else {
				p = p.add(direction);
				path.push([p.x, p.y]);
				i++;
			}
		}

		return path;
	}

	/**
	 * Runs a series of moves to walk cube c over the boundary of the
	 * configuration to end up at the given empty cell target, in such a way
	 * that it does not pass the origin.
	 */
	*walkBoundaryUntil(c: Cube, target: [number, number]): Algorithm {
		let path = this.findClockwiseBoundaryPath(c, target);
		if (path === null) {
			path = this.findCounterClockwiseBoundaryPath(c, target);
		}
		if (path === null) {
			throw "cannot find a boundary path in both directions from " +
					c.p + " to " + target;
		}
		for (let i = 0; i < path.length - 1; i++) {
			const cube = this.world.getCube(path[i]);
			if (!cube) {
				continue;
			}
			const move = this.world.getMoveTo(cube, path[i + 1]);
			// it may happen that no move is possible to get to path[i + 1],
			// for example, when we would need to enter a pocket to do so
			// in this case, we simply do not perform the move to leave the
			// cube where it is
			if (move) {
				yield move;
			}
		}
	}
}

export {GatherAlgorithm};

