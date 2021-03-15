import {Algorithm, World, Move, MoveDirection} from '../world';
import {Cube, ComponentStatus} from '../cube';
import {Vector} from '../vector';

class CompactAlgorithm {

	constructor(public world: World) {}

	*execute(): Algorithm {
		// is there a free move maintaining chunkiness? do it
		let move: Move | null;
		while (move = this.findFreeMove()) {
			yield move;
		}

		// is there a corner move maintaining chunkiness? do it
		// repeat until nothing possible
	}

	findFreeMove(): Move | null {

		for (let cube of this.world.cubes) {
			const directions = [
				MoveDirection.S,
				MoveDirection.W,
				MoveDirection.SW,
				MoveDirection.WS,
				MoveDirection.NW,
				MoveDirection.WN
			];
			const [minX, minY, maxX, maxY] = this.world.bounds();
			for (let direction of directions) {
				const move = new Move(this.world, cube.p, direction);
				if (move.isValid() && this.preservesChunkiness(
						move.sourcePosition(), move.targetPosition()
				)) {
					const target = move.targetPosition();
					if (target[0] >= minX && target[1] >= minY) {
						return move;
					}
				}
			}
		}

		return null;
	}

	preservesChunkiness(source: [number, number], target: [number, number]) {
		if (this.world.getCube(source)!.componentStatus !==
				ComponentStatus.CHUNK_STABLE) {
			throw 'tried to determine if moving an unstable/non-chunk cube ' +
					'preserves chunkiness';
		}

		console.log('checking chunkiness for', source, target);
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
				console.log('nope!');
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
			console.log('nope!!!');
			return false;
		}

		this.world.moveCube(target, source);
		console.log('yes!!!');
		return true;
	}
}

export {CompactAlgorithm};

