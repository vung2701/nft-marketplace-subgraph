import {
	NFTMinted as NFTMintedEvent,
	NFTSold as NFTSoldEvent,
	Transfer as TransferEvent,
	NFTListed as NFTListedEvent
} from '../generated/NFTMarketplace/NFTMarketplace'
import { NFT, Sale, Transfer, User } from '../generated/schema'
import { BigInt, Bytes } from '@graphprotocol/graph-ts'

export function handleNFTMinted(event: NFTMintedEvent): void {
	let nft = new NFT(event.params.tokenId.toString())
	let user = getOrCreateUser(event.params.creator)

	nft.tokenId = event.params.tokenId
	nft.creator = event.params.creator
	nft.owner = event.params.creator
	nft.tokenURI = event.params.tokenURI
	nft.price = BigInt.fromI32(0)
	nft.isListed = false
	nft.createdAt = event.block.timestamp
	nft.updatedAt = event.block.timestamp

	nft.save()
	user.save()
}

export function handleNFTSold(event: NFTSoldEvent): void {
	let nft = NFT.load(event.params.tokenId.toString())
	if (nft) {
		let sale = new Sale(event.transaction.hash.toHexString() + "-" + event.logIndex.toString())
		let seller = getOrCreateUser(event.params.seller)
		let buyer = getOrCreateUser(event.params.buyer)

		sale.nft = nft.id
		sale.seller = event.params.seller
		sale.buyer = event.params.buyer
		sale.price = event.params.price
		sale.timestamp = event.block.timestamp
		sale.transactionHash = event.transaction.hash
		sale.save()

		nft.owner = event.params.buyer
		nft.isListed = false
		nft.updatedAt = event.block.timestamp
		nft.save()

		seller.save()
		buyer.save()
	}
}

export function handleNFTListed(event: NFTListedEvent): void {
	let nft = NFT.load(event.params.tokenId.toString())
	if (nft) {
		nft.price = event.params.price
		nft.isListed = true
		nft.updatedAt = event.block.timestamp
		nft.save()
	}
}

export function handleTransfer(event: TransferEvent): void {
	let nft = NFT.load(event.params.tokenId.toString())
	if (nft) {
		let transfer = new Transfer(event.transaction.hash.toHexString() + "-" + event.logIndex.toString())
		let fromUser = getOrCreateUser(event.params.from)
		let toUser = getOrCreateUser(event.params.to)

		transfer.nft = nft.id
		transfer.from = event.params.from
		transfer.to = event.params.to
		transfer.timestamp = event.block.timestamp
		transfer.transactionHash = event.transaction.hash
		transfer.save()

		nft.owner = event.params.to
		nft.updatedAt = event.block.timestamp
		nft.save()

		fromUser.save()
		toUser.save()
	}
}

function getOrCreateUser(address: Bytes): User {
	let user = User.load(address.toHexString())
	if (user == null) {
		user = new User(address.toHexString())
		user.address = address
		user.totalNFTsOwned = BigInt.fromI32(0)
		user.totalNFTsCreated = BigInt.fromI32(0)
		user.totalSales = BigInt.fromI32(0)
		user.totalPurchases = BigInt.fromI32(0)
	}
	return user
} 