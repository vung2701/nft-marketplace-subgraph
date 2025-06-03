import {
	NFTListed as NFTListedEvent,
	NFTBought as NFTBoughtEvent
} from '../generated/NFTMarketplace/NFTMarketplace'
import { Listing, Purchase, User, MarketplaceStat } from '../generated/schema'
import { BigInt, Bytes, store } from '@graphprotocol/graph-ts'

let ZERO_BI = BigInt.fromI32(0)
let ONE_BI = BigInt.fromI32(1)
let MARKETPLACE_STAT_ID = "marketplace-stats"

export function handleNFTListed(event: NFTListedEvent): void {
	// Create unique listing ID using transaction hash and log index
	let listingId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
	let listing = new Listing(listingId)

	listing.listingId = BigInt.fromI32(0) // This could be improved by tracking a counter
	listing.seller = event.params.seller
	listing.nftAddress = event.params.nftAddress
	listing.tokenId = event.params.tokenId
	listing.price = event.params.price
	listing.isSold = false
	listing.listedAt = event.block.timestamp
	listing.transactionHash = event.transaction.hash

	listing.save()

	// Update seller stats
	let seller = getOrCreateUser(event.params.seller)
	seller.totalListings = seller.totalListings.plus(ONE_BI)
	seller.save()

	// Update marketplace stats
	let marketplaceStat = getOrCreateMarketplaceStat()
	marketplaceStat.totalListings = marketplaceStat.totalListings.plus(ONE_BI)
	marketplaceStat.totalActiveListings = marketplaceStat.totalActiveListings.plus(ONE_BI)
	marketplaceStat.updatedAt = event.block.timestamp
	marketplaceStat.save()
}

export function handleNFTBought(event: NFTBoughtEvent): void {
	// Create purchase record
	let purchaseId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
	let purchase = new Purchase(purchaseId)

	purchase.buyer = event.params.buyer
	purchase.nftAddress = event.params.nftAddress
	purchase.tokenId = event.params.tokenId
	purchase.price = event.params.price
	purchase.timestamp = event.block.timestamp
	purchase.transactionHash = event.transaction.hash

	// Try to find the corresponding active listing for this NFT
	// This is a simplified approach - in a real implementation, you might want to:
	// 1. Add listing ID to the purchase event
	// 2. Or maintain a mapping of active listings by NFT address + token ID
	let listingFound = false
	let seller: Bytes

	// For now, we'll use a placeholder approach
	// In a production system, you'd want to track active listings more systematically
	purchase.seller = Bytes.fromHexString("0x0000000000000000000000000000000000000000")
	seller = purchase.seller

	purchase.save()

	// Update buyer stats
	let buyer = getOrCreateUser(event.params.buyer)
	buyer.totalPurchases = buyer.totalPurchases.plus(ONE_BI)
	buyer.totalVolumeAsBuyer = buyer.totalVolumeAsBuyer.plus(event.params.price)
	buyer.save()

	// Update seller stats if we found the seller
	if (!seller.equals(Bytes.fromHexString("0x0000000000000000000000000000000000000000"))) {
		let sellerUser = getOrCreateUser(seller)
		sellerUser.totalSales = sellerUser.totalSales.plus(ONE_BI)
		sellerUser.totalVolumeAsSeller = sellerUser.totalVolumeAsSeller.plus(event.params.price)
		sellerUser.save()
	}

	// Update marketplace stats
	let marketplaceStat = getOrCreateMarketplaceStat()
	marketplaceStat.totalSales = marketplaceStat.totalSales.plus(ONE_BI)
	marketplaceStat.totalVolume = marketplaceStat.totalVolume.plus(event.params.price)
	marketplaceStat.totalActiveListings = marketplaceStat.totalActiveListings.minus(ONE_BI)

	// Update average price
	if (marketplaceStat.totalSales.gt(ZERO_BI)) {
		marketplaceStat.averagePrice = marketplaceStat.totalVolume.div(marketplaceStat.totalSales)
	}

	marketplaceStat.updatedAt = event.block.timestamp
	marketplaceStat.save()
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

function getOrCreateMarketplaceStat(): MarketplaceStat {
	let marketplaceStat = MarketplaceStat.load(MARKETPLACE_STAT_ID)
	if (marketplaceStat == null) {
		marketplaceStat = new MarketplaceStat(MARKETPLACE_STAT_ID)
		marketplaceStat.totalListings = ZERO_BI
		marketplaceStat.totalSales = ZERO_BI
		marketplaceStat.totalVolume = ZERO_BI
		marketplaceStat.totalActiveListings = ZERO_BI
		marketplaceStat.averagePrice = ZERO_BI
		marketplaceStat.updatedAt = ZERO_BI
	}
	return marketplaceStat
} 