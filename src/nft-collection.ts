import { Transfer as TransferEvent } from '../generated/templates/NFTCollection/NFTCollection'
import { NFTCollection as NFTCollectionContract } from '../generated/templates/NFTCollection/NFTCollection'
import { NFT, NFTCollection, User, NFTAttribute } from '../generated/schema'
import { BigInt, Bytes, Address, json, JSONValueKind, log } from '@graphprotocol/graph-ts'

let ZERO_BI = BigInt.fromI32(0)
let ONE_BI = BigInt.fromI32(1)
let ZERO_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000000")

export function handleTransfer(event: TransferEvent): void {
	let collection = getOrCreateNFTCollection(event.address)
	let nftId = event.address.toHexString() + "-" + event.params.tokenId.toString()

	// Check if this is a mint (from zero address)
	if (event.params.from.equals(ZERO_ADDRESS)) {
		// This is a mint
		let nft = new NFT(nftId)
		nft.tokenId = event.params.tokenId
		nft.collection = collection.id
		let owner = getOrCreateUser(event.params.to)
		nft.owner = owner.id
		nft.ownerAddress = event.params.to
		nft.createdAt = event.block.timestamp
		nft.updatedAt = event.block.timestamp

		// Try to get token URI and metadata
		let contract = NFTCollectionContract.bind(event.address)
		let tokenURIResult = contract.try_tokenURI(event.params.tokenId)

		if (!tokenURIResult.reverted) {
			nft.tokenURI = tokenURIResult.value

			// Try to parse metadata from tokenURI
			if (tokenURIResult.value.startsWith("data:application/json;base64,")) {
				// Handle base64 encoded JSON
				let base64Data = tokenURIResult.value.substring(29) // Remove "data:application/json;base64," prefix
				// Note: AssemblyScript doesn't have built-in base64 decoding
				// For production, you might want to use a library or handle this differently
				nft.name = "NFT #" + event.params.tokenId.toString()
				nft.description = "NFT from collection " + event.address.toHexString()
				nft.image = ""
			} else if (tokenURIResult.value.startsWith("data:application/json,")) {
				// Handle direct JSON
				let jsonData = tokenURIResult.value.substring(22) // Remove "data:application/json," prefix
				let parsed = json.try_fromString(jsonData)

				if (parsed.isOk && parsed.value.kind == JSONValueKind.OBJECT) {
					let obj = parsed.value.toObject()

					// Get name
					let nameValue = obj.get("name")
					if (nameValue && nameValue.kind == JSONValueKind.STRING) {
						nft.name = nameValue.toString()
					} else {
						nft.name = "NFT #" + event.params.tokenId.toString()
					}

					// Get description
					let descValue = obj.get("description")
					if (descValue && descValue.kind == JSONValueKind.STRING) {
						nft.description = descValue.toString()
					}

					// Get image
					let imageValue = obj.get("image")
					if (imageValue && imageValue.kind == JSONValueKind.STRING) {
						nft.image = imageValue.toString()
					}

					// Parse attributes
					let attributesValue = obj.get("attributes")
					if (attributesValue && attributesValue.kind == JSONValueKind.ARRAY) {
						let attributesArray = attributesValue.toArray()

						for (let i = 0; i < attributesArray.length; i++) {
							let attr = attributesArray[i]
							if (attr.kind == JSONValueKind.OBJECT) {
								let attrObj = attr.toObject()
								let traitType = attrObj.get("trait_type")
								let value = attrObj.get("value")

								if (traitType && value &&
									traitType.kind == JSONValueKind.STRING &&
									value.kind == JSONValueKind.STRING) {

									let attributeId = nftId + "-" + traitType.toString()
									let attribute = new NFTAttribute(attributeId)
									attribute.nft = nftId
									attribute.traitType = traitType.toString()
									attribute.value = value.toString()
									attribute.save()
								}
							}
						}
					}
				}
			} else {
				// Default values for external URIs (IPFS, HTTP)
				nft.name = "NFT #" + event.params.tokenId.toString()
				nft.description = "NFT from collection " + event.address.toHexString()
				nft.image = ""
			}
		} else {
			// TokenURI call failed, use defaults
			nft.name = "NFT #" + event.params.tokenId.toString()
			nft.description = "NFT from collection " + event.address.toHexString()
			nft.image = ""
		}

		nft.save()

		// Update collection total supply
		collection.totalSupply = collection.totalSupply.plus(ONE_BI)
		collection.save()

	} else {
		// This is a transfer
		let nft = NFT.load(nftId)
		if (nft) {
			let newOwner = getOrCreateUser(event.params.to)
			nft.owner = newOwner.id
			nft.ownerAddress = event.params.to
			nft.updatedAt = event.block.timestamp
			nft.save()
		}
	}

	// Update user stats
	let newOwner = getOrCreateUser(event.params.to)
	newOwner.save()

	if (!event.params.from.equals(ZERO_ADDRESS)) {
		let previousOwner = getOrCreateUser(event.params.from)
		previousOwner.save()
	}
}

function getOrCreateNFTCollection(address: Address): NFTCollection {
	let collection = NFTCollection.load(address.toHexString())
	if (collection == null) {
		collection = new NFTCollection(address.toHexString())
		collection.address = address
		collection.totalSupply = ZERO_BI
		collection.createdAt = BigInt.fromI32(0)

		// Try to get collection name and symbol
		let contract = NFTCollectionContract.bind(address)
		let nameResult = contract.try_name()
		let symbolResult = contract.try_symbol()

		if (!nameResult.reverted) {
			collection.name = nameResult.value
		}

		if (!symbolResult.reverted) {
			collection.symbol = symbolResult.value
		}

		collection.save()
	}
	return collection
}

function getOrCreateUser(address: Bytes): User {
	let user = User.load(address.toHexString())
	if (user == null) {
		user = new User(address.toHexString())
		user.address = address
		user.totalListings = ZERO_BI
		user.totalPurchases = ZERO_BI
		user.totalSales = ZERO_BI
		user.totalVolumeAsBuyer = ZERO_BI
		user.totalVolumeAsSeller = ZERO_BI
	}
	return user
} 