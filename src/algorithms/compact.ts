import {Algorithm, World, Move, MoveDirection} from '../world';
import {Cube, ComponentStatus} from '../cube';
import {Vector} from '../vector';

class CompactAlgorithm {

	CONSTRAIN_TO_CHUNK_BOUNDS = false;

	constructor(public world: World) {}

	*execute(): Algorithm {
		printStep('Compacting');

		// is there a free move maintaining chunkiness? do it
		let move: Move[] | null;
		while ((move = this.findFreeMove()) || (move = this.findCornerMove())) {
			for (let m of move) {
				yield m;
			}
		}

		// is there a corner move maintaining chunkiness? do it
		// repeat until nothing possible
	}

	findFreeMove(): Move[] | null {

		const [minX, minY, maxX, maxY] = this.world.bounds();
		for (let cube of this.world.cubes) {
			if (//cube.componentStatus !== ComponentStatus.LINK_STABLE &&
					cube.componentStatus !== ComponentStatus.CHUNK_STABLE) {
				continue;
			}
			const directions = [
				MoveDirection.S,
				MoveDirection.W,
				MoveDirection.SW,
				MoveDirection.WS,
				MoveDirection.NW,
				MoveDirection.WN
			];
			for (let direction of directions) {
				const move = new Move(this.world, cube.p, direction);
				const target = move.targetPosition();
				if (move.isValidIgnoreConnectivity() &&
						target[0] >= minX && target[1] >= minY &&
						(!this.CONSTRAIN_TO_CHUNK_BOUNDS || this.withinChunkBounds(cube.chunkId, target)) &&
						this.preservesChunkiness(cube.p, target)
				) {
					printMiniStep(`Free move`);
					return [move];
				}
			}
		}

		return null;
	}

	withinChunkBounds(chunkId: number, coord: [number, number]): boolean {
		let [minX, minY, maxX, maxY] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
		for (let cube of this.world.cubes) {
			if (cube.chunkId === chunkId) {
				let [x, y] = cube.p;
				minX = Math.min(minX, x);
				minY = Math.min(minY, y);
				maxX = Math.max(maxX, x);
				maxY = Math.max(maxY, y);
			}
		}
		return coord[0] >= minX && coord[0] <= maxX &&
				coord[1] >= minY && coord[1] <= maxY;
	}

	findCornerMove(): Move[] | null {

		for (let cube of this.world.cubes) {
			const [x, y] = cube.p;
			const neighbor = this.world.getNeighborMap(cube.p);

			// top corner move
			if (!neighbor['W'] && neighbor['N'] && neighbor['NW'] &&
					cube.componentStatus === ComponentStatus.CHUNK_STABLE &&
					neighbor['N'].componentStatus === ComponentStatus.CHUNK_STABLE) {

				if (this.preservesChunkiness(neighbor['N'].p, [x - 1, y])) {
					printMiniStep(`Top corner move`);
					return [
						new Move(this.world, cube.p, MoveDirection.W),
						new Move(this.world, neighbor['N'].p, MoveDirection.S),
					];
				}
			}

			if (!neighbor['S'] && neighbor['E'] && neighbor['SE'] &&
					cube.componentStatus === ComponentStatus.CHUNK_STABLE &&
					neighbor['E'].componentStatus === ComponentStatus.CHUNK_STABLE) {

				if (this.preservesChunkiness(neighbor['E'].p, [x, y - 1])) {
					printMiniStep(`Top corner move`);
					return [
						new Move(this.world, cube.p, MoveDirection.S),
						new Move(this.world, neighbor['E'].p, MoveDirection.W),
					];
				}
			}
		}

		for (let cube of this.world.cubes) {
			const [x, y] = cube.p;
			const neighbor = this.world.getNeighborMap(cube.p);

			// bottom corner move
			if (!neighbor['W'] && neighbor['S'] && neighbor['SW'] &&
					cube.componentStatus === ComponentStatus.CHUNK_STABLE &&
					neighbor['S'].componentStatus === ComponentStatus.CHUNK_STABLE) {

				if (this.preservesChunkiness(neighbor['S'].p, [x - 1, y])) {
					printMiniStep(`Bottom corner move`);
					return [
						new Move(this.world, cube.p, MoveDirection.W),
						new Move(this.world, neighbor['S'].p, MoveDirection.N),
					];
				}
			}

			if (!neighbor['N'] && neighbor['E'] && neighbor['NE'] &&
					cube.componentStatus === ComponentStatus.CHUNK_STABLE &&
					neighbor['E'].componentStatus === ComponentStatus.CHUNK_STABLE) {

				if (this.preservesChunkiness(neighbor['E'].p, [x, y + 1])) {
					printMiniStep(`Bottom corner move`);
					return [
						new Move(this.world, cube.p, MoveDirection.N),
						new Move(this.world, neighbor['E'].p, MoveDirection.W),
					];
				}
			}
		}

		return null;
	}

	preservesChunkiness(source: [number, number], target: [number, number]) {
		if (this.world.getCube(source)!.componentStatus !==
				ComponentStatus.CHUNK_STABLE) {
			throw 'tried to determine if moving unstable/non-chunk cube ' +
					'(' + source[0] + ', ' + source[1] + ') to ' +
					'(' + target[0] + ', ' + target[1] + ') ' +
					'preserves chunkiness';
		}

		this.world.moveCube(source, target);

		// check if all neighbors are still in a chunk, and if they are all in
		// the same chunk
		const neighbors = this.world.getNeighbors(source);
		let chunk = -1;
		for (let neighbor of neighbors) {
			if (neighbor.componentStatus === ComponentStatus.LINK_STABLE ||
					neighbor.componentStatus === ComponentStatus.LINK_CUT ||
					(chunk !== -1 && neighbor.chunkId !== -1 && neighbor.chunkId !== chunk)) {
				this.world.moveCube(target, source);
				return false;
			}
			if (neighbor.chunkId !== -1) {
				chunk = neighbor.chunkId;
			}
		}

		const targetStatus = this.world.getCube(target)!.componentStatus;
		if (targetStatus === ComponentStatus.LINK_STABLE ||
				targetStatus === ComponentStatus.LINK_CUT) {
			this.world.moveCube(target, source);
			return false;
		}

		this.world.moveCube(target, source);
		return true;
	}
}

export {CompactAlgorithm};

